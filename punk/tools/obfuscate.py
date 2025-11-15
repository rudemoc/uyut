# tools/obfuscate_fixed.py - Безопасная обфускация
import os
import re

def safe_minify_js(code):
    """Безопасная минификация без повреждения функциональности"""
    
    # Сохраняем важные строки и идентификаторы перед обработкой
    preserved_strings = []
    preserved_identifiers = []
    
    # Сохраняем все строки в кавычках
    string_pattern = r'("(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')'
    def save_string(match):
        preserved_strings.append(match.group(0))
        return f'__STRING_{len(preserved_strings)-1}__'
    
    code = re.sub(string_pattern, save_string, code)
    
    # Сохраняем критически важные идентификаторы
    critical_identifiers = [
        # DOM элементы
        'messagesDiv', 'imageViewer', 'viewerImage', 'editor', 'fileInput',
        'sendContainer', 'cooldownOverlay', 'cooldownSeconds', 'emojiPicker',
        'boldBtn', 'italicBtn', 'sizeSelect', 'emojiBtn', 'closeEmojiPicker',
        'resizerTop', 'sendButton', 'closeViewerButton',
        
        # Socket.io
        'socket', 'io',
        
        # Классы и конструкторы
        'RoomChat', 'roomChat',
        
        # Методы, которые вызываются из HTML или внешне
        'addMessage', 'handleSubmit', 'handleFileUpload', 'uploadFile',
        'startCooldown', 'resetViewer', 'toggleEmojiPicker', 'hideEmojiPicker',
        'formatText', 'changeFontSize', 'scrollToBottom', 'updateTransform',
        
        # Ключевые свойства
        'initialMessages', 'defaultAvatar', 'currentCooldown', 'cooldownTime',
        'zoomScale', 'translateX', 'translateY', 'isDragging', 'isResizing',
        
        # Системные функции
        'getElementById', 'addEventListener', 'querySelector', 'querySelectorAll',
        'createElement', 'appendChild', 'classList', 'focus', 'execCommand',
        'emit', 'on', 'JSON', 'parse', 'console', 'log', 'error',
        
        # Глобальные объекты
        'window', 'document', 'Date', 'Math', 'Array', 'Object', 'String',
        'Number', 'Boolean', 'Function', 'Promise', 'setInterval', 'setTimeout',
        'clearInterval', 'clearTimeout', 'fetch', 'FormData', 'alert'
    ]
    
    # Создаем словарь для сохранения критических идентификаторов
    for identifier in critical_identifiers:
        if identifier in code:
            preserved_identifiers.append(identifier)
            code = code.replace(identifier, f'__ID_{len(preserved_identifiers)-1}__')
    
    # Теперь минифицируем безопасно
    lines = []
    for line in code.split('\n'):
        # Удаляем только однострочные комментарии
        if '//' in line:
            line = line.split('//')[0]
        line = line.strip()
        if line and not line.startswith('//'):
            lines.append(line)
    
    # Базовое удаление пробелов (только там, где безопасно)
    minified = ' '.join(lines)
    minified = re.sub(r'\s*([=;{},()])\s*', r'\1', minified)
    minified = re.sub(r';\s*;', ';', minified)
    minified = re.sub(r',\s*,', ',', minified)
    
    # Восстанавливаем сохраненные строки
    for i, string in enumerate(preserved_strings):
        minified = minified.replace(f'__STRING_{i}__', string)
    
    # Восстанавливаем критические идентификаторы
    for i, identifier in enumerate(preserved_identifiers):
        minified = minified.replace(f'__ID_{i}__', identifier)
    
    return minified

def add_light_protection(code):
    """Добавляем легкую защиту без нарушения функциональности"""
    protection = '''
// Легкая защита
(function(){
    // Только базовые проверки
    document.addEventListener('contextmenu', function(e) {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) {
            return; // Разрешаем контекстное меню для редактирования
        }
        e.preventDefault();
    });
    
    // Защита от простого копирования (но разрешаем выделение для UX)
    document.addEventListener('copy', function(e) {
        // Разрешаем копирование из полей ввода
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' || e.target.isContentEditable) {
            return;
        }
        // Для остального контента можно показать предупреждение
        if (!window.copyWarningShown) {
            // e.preventDefault(); // Раскомментируйте для строгой защиты
            console.log('Копирование контента ограничено');
            window.copyWarningShown = true;
        }
    });
})();
'''
    return protection + '\n' + code

def process_js_files_safe():
    """Безопасная обработка JS файлов"""
    static_dir = 'static'
    backup_dir = 'static_backup'
    
    # Создаем backup
    if not os.path.exists(backup_dir):
        os.makedirs(backup_dir)
    
    js_files = ['home.js', 'room.js']
    
    for js_file in js_files:
        input_path = os.path.join(static_dir, js_file)
        backup_path = os.path.join(backup_dir, js_file)
        
        if os.path.exists(input_path):
            print(f"Обработка {js_file}...")
            
            # Читаем оригинальный файл
            with open(input_path, 'r', encoding='utf-8') as f:
                original_code = f.read()
            
            # Создаем backup
            with open(backup_path, 'w', encoding='utf-8') as f:
                f.write(original_code)
            
            # Безопасная минификация
            minified = safe_minify_js(original_code)
            
            # Добавляем легкую защиту
            protected_code = add_light_protection(minified)
            
            # Сохраняем обработанный файл
            with open(input_path, 'w', encoding='utf-8') as f:
                f.write(protected_code)
            
            print(f"✓ {js_file} обработан безопасно")
            print(f"  Исходный размер: {len(original_code)} символов")
            print(f"  После обработки: {len(protected_code)} символов")
            print(f"  Сжатие: {len(protected_code)/len(original_code)*100:.1f}%")
        else:
            print(f"✗ Файл не найден: {input_path}")

def restore_backup():
    """Восстанавливаем файлы из backup"""
    static_dir = 'static'
    backup_dir = 'static_backup'
    
    js_files = ['home.js', 'room.js']
    
    for js_file in js_files:
        backup_path = os.path.join(backup_dir, js_file)
        static_path = os.path.join(static_dir, js_file)
        
        if os.path.exists(backup_path):
            with open(backup_path, 'r', encoding='utf-8') as f:
                backup_code = f.read()
            
            with open(static_path, 'w', encoding='utf-8') as f:
                f.write(backup_code)
            
            print(f"✓ {js_file} восстановлен из backup")
        else:
            print(f"✗ Backup не найден: {backup_path}")

if __name__ == "__main__":
    print("Выберите действие:")
    print("1 - Безопасная обфускация")
    print("2 - Восстановить из backup")
    
    choice = input("Введите 1 или 2: ").strip()
    
    if choice == "1":
        print("Запуск безопасной обфускации...")
        process_js_files_safe()
        print("Готово! Файлы сохранены в static/")
    elif choice == "2":
        print("Восстановление из backup...")
        restore_backup()
        print("Готово! Файлы восстановлены.")
    else:
        print("Неверный выбор")