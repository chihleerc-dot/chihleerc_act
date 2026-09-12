const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const eventHeaders = ['EventId','Title','Category','Description','Location','Capacity','SessionsData','Teacher','HasMeal','HasSnack','IsOneOnOne','TagsData','IsSeries','IsPublished','ImagesData'];
const registrationHeaders = ['RegistrationId','EventId','StudentId','StudentName','Counselor','SessionsData','AdminRemark','LineNotifiedAt','SurveyNotifiedAt'];
const studentHeaders = ['StudentId','Name','EduSystem','ClassName','Counselor','LineUserId'];
const adminHeaders = ['Account','Password','Name','Role'];
const logHeaders = ['Timestamp','Message'];

const session = (date,time,location='教室') => ({date,time,location});
const eventRow = (id, sessions, options={}) => [
  id, options.title || id, options.category || '職涯', '介紹', options.location || '教室', options.capacity || 10,
  JSON.stringify(sessions), options.teacher || '王老師', false, false, Boolean(options.one), '[]', Boolean(options.series),
  options.published !== false, '[]'
];
const regRow = (id,eventId,studentId,sessions) => [id,eventId,studentId,'測試生','王老師',JSON.stringify(sessions.map(value=>({...value,attend:true,meal:'不用餐'}))),'','',''];

class FakeSheet {
  constructor(values){ this.values=values; }
  getDataRange(){ return {getValues:()=>this.values}; }
  getLastRow(){ return this.values.length; }
  appendRow(row){ this.values.push(row); }
  deleteRow(row){ this.values.splice(row-1,1); }
  getRange(row,column,rowCount,columnCount){
    return {setValue:(value)=>{
      if(!this.values[row-1]) this.values[row-1]=[];
      this.values[row-1][column-1]=value;
    },setValues:(rows)=>{
      rows.forEach((values,rowOffset)=>{
        const target=row-1+rowOffset;
        if(!this.values[target]) this.values[target]=[];
        values.forEach((value,columnOffset)=>{ this.values[target][column-1+columnOffset]=value; });
      });
    }};
  }
}

const original = session('2099/10/01','10:00-11:00','A教室');
const overlap = session('2099/10/01','10:30–11:30','B教室');
const adjacent = session('2099/10/01','11:00—12:00','C教室');
const batchOverlap = session('2099/10/01','10:45-11:15','D教室');
const hidden = session('2099/10/02','09:00-10:00','E教室');
const sheets = {
  Events: new FakeSheet([eventHeaders,
    eventRow('original',[original],{title:'原活動'}),
    eventRow('overlap',[overlap],{title:'重疊活動'}),
    eventRow('adjacent',[adjacent],{title:'相鄰活動'}),
    eventRow('batch',[batchOverlap],{title:'批次重疊活動'}),
    eventRow('hidden',[hidden],{title:'未公開活動',published:false})
  ]),
  Registrations: new FakeSheet([registrationHeaders,regRow('r1','original','12345678',[original])]),
  Students: new FakeSheet([studentHeaders,['12345678','測試生','日四技','四技一甲','王老師',''],['87654321','第二生','日四技','四技一乙','王老師','']]),
  Admins: new FakeSheet([adminHeaders]),
  Logs: new FakeSheet([logHeaders])
};
const spreadsheet = {getSheetByName:name=>sheets[name] || null};
const cacheData = new Map();
const propertyData = new Map();
let uuidIndex=1;
const context = {
  console,
  SpreadsheetApp:{getActiveSpreadsheet:()=>spreadsheet,openById:()=>spreadsheet,flush:()=>{}},
  PropertiesService:{getScriptProperties:()=>({
    getProperty:key=>propertyData.get(key)||'', setProperty:(key,value)=>propertyData.set(key,value),
    deleteProperty:key=>propertyData.delete(key), getProperties:()=>Object.fromEntries(propertyData)
  })},
  CacheService:{getScriptCache:()=>({get:key=>cacheData.get(key)||null,put:(key,value)=>cacheData.set(key,value),remove:key=>cacheData.delete(key)})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,waitLock:()=>true,releaseLock:()=>{}})},
  Utilities:{
    getUuid:()=>`uuid-${uuidIndex++}`,
    computeDigest:()=>Array(32).fill(7), base64EncodeWebSafe:()=> 'mockdigest',
    DigestAlgorithm:{SHA_256:'SHA_256'}, Charset:{UTF_8:'UTF_8'},
    formatDate:(date,_tz,format)=>{
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).reduce((result,part)=>(result[part.type]=part.value,result),{});
      if(format==='yyyy/MM/dd HH:mm') return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
      if(format==='yyyy-MM') return `${parts.year}-${parts.month}`;
      return `${parts.year}/${parts.month}/${parts.day}`;
    }
  },
  Map,Set,Date,JSON,Math,Number,String,Array,Object,Error,RegExp,Intl,isNaN,parseInt
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('Code.gs','utf8'),context);
context.consumeRateLimit=()=>{};
context.logAction=()=>{};

const publicPayload = (eventId, studentId, targetSession) => [{eventId,studentId,name:studentId==='12345678'?'測試生':'第二生',counselor:'王老師',sessionsData:[{...targetSession,attend:true,meal:'不用餐'}]}];
const adminIdentity={name:'管理員',role:'admin',account:'admin'};

// 第一層：查詢只回傳本人紀錄與必要活動摘要，不含承辦人及其他學生資料。
const queried=context.queryStudent('12345678','測 試生','王老師');
assert.equal(queried.length,1);
assert.equal(queried[0].eventSummary.title,'原活動');
assert.equal(Object.prototype.hasOwnProperty.call(queried[0].eventSummary,'teacher'),false);
assert.equal(Object.prototype.hasOwnProperty.call(queried[0],'studentId'),false);

// 第二層：學生自行報名與後台代報都由後端阻擋衝堂；相鄰時段可以報名。
assert.throws(()=>context.submitRegistration(publicPayload('overlap','12345678',overlap),false),error=>error&&error.publicCode==='TIME_CONFLICT');
assert.throws(()=>context.submitRegistration(publicPayload('overlap','12345678',overlap),true,adminIdentity),error=>error&&error.publicCode==='TIME_CONFLICT');
const adjacentResult=context.submitRegistration(publicPayload('adjacent','12345678',adjacent),false);
assert.equal(adjacentResult.success,true);

// 第三層：同一批次互相衝堂、未公開活動與身分不符均不得寫入。
const beforeBatch=sheets.Registrations.values.length;
assert.throws(()=>context.submitRegistration([
  ...publicPayload('overlap','87654321',overlap),
  ...publicPayload('batch','87654321',batchOverlap)
],false),error=>error&&error.publicCode==='TIME_CONFLICT');
assert.equal(sheets.Registrations.values.length,beforeBatch);
assert.throws(()=>context.submitRegistration(publicPayload('hidden','87654321',hidden),false),error=>error&&error.publicCode==='EVENT_NOT_PUBLIC');
assert.throws(()=>context.submitRegistration([{...publicPayload('hidden','87654321',hidden)[0],name:'錯誤姓名'}],false),error=>error&&error.publicCode==='EVENT_NOT_PUBLIC');

// 公開狀態寫入後立即清除公開快取，避免學生端短時間仍看到舊狀態。
cacheData.set('PUBLIC_DATA_V11_21_0','stale');
const publishResult=context.setEventPublished('hidden',true,adminIdentity);
assert.equal(publishResult.isPublished,true);
assert.equal(sheets.Events.values.find(row=>row[0]==='hidden')[13],true);
assert.equal(cacheData.has('PUBLIC_DATA_V11_21_0'),false);

// 前端靜態契約：標題不變、台北時區出現在成功畫面及查詢紀錄兩條連結，沒有提醒參數。
const app=fs.readFileSync('app.js','utf8');
const backend=fs.readFileSync('Code.gs','utf8');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('app-custom.css','utf8');
assert.equal((app.match(/ctz=Asia%2FTaipei/g)||[]).length,2);
assert.equal(/reminder|VALARM|1440/.test(app),false);
assert.equal(html.includes('>近期活動</h1>'),true);
assert.equal(html.includes('選擇近期活動'),false);
assert.equal(css.includes('content: "活動分類"'),false);
assert.equal(app.includes('text=${encodeURIComponent(ev.title)}'),true);
assert.equal(app.includes('text=${encodeURIComponent(item.event.title)}'),true);
assert.equal(app.includes("studentDisplayMode: 'list'"),true);
assert.equal(app.includes("'switch-student-display': () => switchStudentDisplay"),true);
assert.equal(app.includes('student-grid-status'),true);
assert.equal(app.includes('student-grid-detail-label">活動資訊'),true);
assert.equal(html.includes('data-display="list" aria-pressed="true"'),true);
assert.equal(html.includes('data-display="grid" aria-pressed="false"'),true);
assert.equal(css.includes('[data-display-mode="grid"] #student-events-container'),true);
assert.equal(css.includes('grid-template-columns: repeat(3, minmax(0, 1fr))'),true);
assert.equal(css.includes('.student-event-card.is-selected'),true);
assert.equal(backend.includes("safeMessage.split(LINE_SESSION_PLACEHOLDER).join(sessionBlock)"),true);
assert.equal(backend.includes("throw createPublicError(message, 'TIME_CONFLICT')"),true);
assert.equal(backend.includes("const PUBLIC_DATA_CACHE_KEY = 'PUBLIC_DATA_V11_21_0'"),true);
assert.equal(html.includes('活動資料尚未載入'),false);
assert.equal(html.includes('正在連線 Google 資料庫'),false);

// 時間分隔符與全形學號的前端輔助函式可接受常見輸入格式。
const frontContext={
  console,Map,Set,Date,JSON,Math,Number,String,Array,Object,Error,RegExp,Intl,isNaN,parseInt,
  window:{addEventListener:()=>{},clearTimeout:()=>{},setTimeout:()=>0,scrollTo:()=>{}},
  document:{addEventListener:()=>{},visibilityState:'visible'},
  sessionStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},
  fetch:()=>Promise.reject(new Error('not used')),
  URL,URLSearchParams,FormData:class{},FileReader:class{},Image:class{},Blob:class{}
};
vm.createContext(frontContext);
vm.runInContext(app,frontContext);
assert.equal(frontContext.normalizeStudentIdInput('１２３４ ５６７８'),'12345678');
assert.equal(frontContext.normalizeTimeRangeSeparator('12:20–15:10'),'12:20-15:10');
assert.equal(frontContext.checkTimeConflict('12:20–15:10','15:00—16:00'),true);
assert.equal(frontContext.checkTimeConflict('12:20–15:10','15:10－16:00'),false);

console.log('V11.21.0 frontend layout, registration, query, conflict, publication and calendar checks: PASS');
