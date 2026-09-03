(function () {
    'use strict';
    if (window.self === window.top) {
        document.documentElement.classList.remove('frame-guard-pending');
        return;
    }
    try { window.top.location = window.self.location; } catch (error) {}
})();
