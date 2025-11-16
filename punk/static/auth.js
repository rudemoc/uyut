// static/auth.js

document.addEventListener('DOMContentLoaded', function() {
    // Обработка отправки форм аутентификации
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            const submitButton = this.querySelector('button[type="submit"]');
            if (submitButton) {
                const originalText = submitButton.textContent;
                submitButton.disabled = true;
                submitButton.textContent = 'Отправка...';
                submitButton.dataset.originalText = originalText;
                
                // Восстановление кнопки через 5 секунд на случай ошибки
                setTimeout(() => {
                    submitButton.disabled = false;
                    submitButton.textContent = originalText;
                }, 5000);
            }
        });
    });

    // Очистка ошибок при фокусе на полях ввода
    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            const errorElement = document.querySelector('.error-message');
            if (errorElement) {
                errorElement.style.display = 'none';
            }
        });
        
        // Автопереход для поля кода подтверждения
        if (input.id === 'code') {
            input.addEventListener('input', function(e) {
                // Оставляем только цифры
                e.target.value = e.target.value.replace(/\D/g, '');
                
                // Автопереход при вводе 6 цифр
                if (e.target.value.length === 6) {
                    const usernameInput = document.getElementById('username');
                    if (usernameInput) {
                        usernameInput.focus();
                    }
                }
            });
        }
        
        // Валидация имени пользователя
        if (input.id === 'username') {
            input.addEventListener('input', function(e) {
                // Разрешаем только буквы, цифры и подчеркивания
                e.target.value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
            });
        }
    });

    // Проверка совпадения паролей в реальном времени
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
        input.addEventListener('input', function() {
            const form = this.closest('form');
            if (form) {
                const password = form.querySelector('input[name="password"], input[name="new_password"]');
                const confirm = form.querySelector('input[name="password_confirm"], input[name="confirm_password"]');
                
                if (password && confirm && password.value && confirm.value) {
                    if (password.value !== confirm.value) {
                        confirm.style.borderColor = '#e0245e';
                    } else {
                        confirm.style.borderColor = '#19cf86';
                    }
                }
            }
        });
    });

    // Автофокус на первом поле формы
    const firstInput = document.querySelector('input[type="email"], input[type="text"]');
    if (firstInput) {
        firstInput.focus();
    }
});