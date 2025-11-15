// static/protection.js - Легкая защита без нарушения функциональности

// Защита только от базового копирования
document.addEventListener('contextmenu', function(e) {
    // Разрешаем контекстное меню в полях ввода
    if (e.target.tagName === 'TEXTAREA' || 
        e.target.tagName === 'INPUT' || 
        e.target.isContentEditable) {
        return;
    }
    e.preventDefault();
});

// Легкая защита от копирования
document.addEventListener('copy', function(e) {
    // Разрешаем копирование из полей ввода
    if (e.target.tagName === 'TEXTAREA' || 
        e.target.tagName === 'INPUT' || 
        e.target.isContentEditable) {
        return;
    }
    
    // Можно показать предупреждение, но не блокировать полностью
    console.log('Копирование контента ограничено');
});

// Базовая защита от DevTools
let devToolsOpen = false;
setInterval(function() {
    const threshold = 160;
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    
    if ((widthThreshold || heightThreshold) && !devToolsOpen) {
        console.log('DevTools обнаружены');
        devToolsOpen = true;
    }
}, 1000);