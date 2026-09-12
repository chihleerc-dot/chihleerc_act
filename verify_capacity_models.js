const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const eventHeaders = ['EventId','Title','Category','Description','Location','Capacity','SessionsData','Teacher','HasMeal','HasSnack','IsOneOnOne','TagsData','IsSeries','IsPublished','ImagesData'];
const registrationHeaders = ['RegistrationId','EventId','StudentId','StudentName','Counselor','SessionsData','AdminRemark','LineNotifiedAt','SurveyNotifiedAt'];
const studentHeaders = ['StudentId','Name','EduSystem','ClassName','Counselor','LineUserId'];
const sessions = {
  single: [{date:'2099/10/01',time:'10:00-11:00',location:'A'}],
  multi: [{date:'2099/10/02',time:'10:00-11:00',location:'B'},{date:'2099/10/03',time:'10:00-11:00',location:'B'}],
  series: [{date:'2099/10/04',time:'10:00-11:00',location:'C'},{date:'2099/10/05',time:'10:00-11:00',location:'C'}],
  one: [{date:'2099/10/06',time:'10:00-11:00',location:'D'},{date:'2099/10/06',time:'11:00-12:00',location:'D'}]
};
const eventRow = (id, cap, ss, one=false, series=false) => [id,id,'職涯','介紹','地點',cap,JSON.stringify(ss),'王老師',false,false,one,'[]',series,true,'[]'];
const regRow = (id,eventId,studentId,selected) => [id,eventId,studentId,'姓名','老師',JSON.stringify(selected.map(s=>({...s,attend:true}))),'','',''];
const sheets = {
  Events: [eventHeaders,
    eventRow('single',2,sessions.single),
    eventRow('multi',2,sessions.multi),
    eventRow('series',2,sessions.series,false,true),
    eventRow('one',9,sessions.one,true,false)
  ],
  Registrations: [registrationHeaders,
    regRow('r1','single','s1',[sessions.single[0]]),
    regRow('r2','multi','s2',[sessions.multi[0]]),
    regRow('r3','multi','s3',[sessions.multi[0]]),
    regRow('r4','multi','s4',[sessions.multi[1]]),
    regRow('r5','series','s5',sessions.series),
    regRow('r6','one','s6',[sessions.one[0]])
  ],
  Students: [studentHeaders,['s1','姓名','學制','班級','王老師','']]
};
const spreadsheet = { getSheetByName(name) { const values=sheets[name]; return values ? {getDataRange:()=>({getValues:()=>values})} : null; } };
const pad = n => String(n).padStart(2,'0');
const context = {
  console,
  SpreadsheetApp:{getActiveSpreadsheet:()=>spreadsheet},
  CacheService:{getScriptCache:()=>({get:()=>null,put:()=>{},remove:()=>{}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
  Utilities:{formatDate:(d,_tz,fmt)=>{
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).reduce((a,p)=>(a[p.type]=p.value,a),{});
    if (fmt==='yyyy/MM/dd HH:mm') return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
    throw new Error('unexpected format '+fmt);
  }},
  Map, Set, Date, JSON, Math, Number, String, Array, Object, Error, RegExp, Intl, isNaN, parseInt
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('Code.gs','utf8'),context);
const result = context.getPublicData();
assert.equal(result.events.length,4);
for (const event of result.events) {
  const stats=result.eventStats[event.id];
  assert.ok(stats && Array.isArray(stats.occupiedSessions) && Array.isArray(stats.sessionStats));
  for (const s of stats.sessionStats) {
    assert.equal(typeof s.registrationCount,'number');
    assert.equal(typeof s.remaining,'number');
    assert.equal(typeof s.isFull,'boolean');
  }
}
assert.deepEqual(Array.from(result.eventStats.single.sessionStats, s=>[s.registrationCount,s.remaining,s.isFull]),[[1,1,false]]);
assert.deepEqual(Array.from(result.eventStats.multi.sessionStats, s=>[s.registrationCount,s.remaining,s.isFull]),[[2,0,true],[1,1,false]]);
assert.deepEqual(Array.from(result.eventStats.series.sessionStats, s=>[s.registrationCount,s.remaining,s.isFull]),[[1,1,false],[1,1,false]]);
assert.deepEqual(Array.from(result.eventStats.one.sessionStats, s=>[s.registrationCount,s.remaining,s.isFull]),[[1,0,true],[0,1,false]]);
assert.deepEqual(Array.from(result.eventStats.one.occupiedSessions, s=>[s.date,s.time]),[['2099/10/06','10:00-11:00']]);

// 後台代報也必須遵守所有容量模式；以下請求都應在寫入前被拒絕。
context.LockService = {getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
sheets.Students.push(['12345678','測試生','學制','班級','王老師','']);
const expectCapacityBlock = (eventId, selectedSessions, code='CAPACITY_FULL') => {
  assert.throws(
    () => context.submitRegistration([{eventId,studentId:'12345678',sessionsData:selectedSessions.map(s=>({...s,attend:true}))}],true,{name:'ADMIN',role:'admin'}),
    error => error && error.publicCode === code
  );
};
expectCapacityBlock('multi',[sessions.multi[0]]);
expectCapacityBlock('one',[sessions.one[0]],'SLOT_TAKEN');
sheets.Registrations.push(regRow('r7','single','s8',[sessions.single[0]]));
expectCapacityBlock('single',[sessions.single[0]]);
sheets.Registrations.push(regRow('r8','series','s9',sessions.series));
expectCapacityBlock('series',sessions.series);
console.log('V11.21.0 public-data contract and four capacity models: PASS');
