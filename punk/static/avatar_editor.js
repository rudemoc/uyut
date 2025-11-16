// static/avatar_editor.js
class AvatarEditor {
    constructor() {
        this.image = null;
        this.cropper = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
    }

    setupEventListeners() {
        const avatarInput = document.getElementById('avatar');
        const avatarPreview = document.getElementById('avatar-preview');
        const cropModal = document.getElementById('crop-modal');
        const cropButton = document.getElementById('crop-button');
        const cancelCropButton = document.getElementById('cancel-crop-button');
        const cancelCropButton2 = document.getElementById('cancel-crop-button-2');
        const cropCanvas = document.getElementById('crop-canvas');
        const cropDataInput = document.getElementById('crop-data');

        if (avatarInput) {
            avatarInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    console.log('File selected:', file.name);
                    this.openCropModal(file);
                }
            });
        }

        if (cancelCropButton) {
            cancelCropButton.addEventListener('click', () => {
                this.closeCropModal();
            });
        }

        if (cancelCropButton2) {
            cancelCropButton2.addEventListener('click', () => {
                this.closeCropModal();
            });
        }

        if (cropButton) {
            cropButton.addEventListener('click', () => {
                this.cropImage();
            });
        }
    }

    openCropModal(file) {
        const cropModal = document.getElementById('crop-modal');
        const cropImage = document.getElementById('crop-image');
        const reader = new FileReader();

        reader.onload = (e) => {
            console.log('File loaded, opening crop modal');
            cropImage.src = e.target.result;
            cropModal.classList.remove('hidden');
            
            // Destroy existing cropper if any
            if (this.cropper) {
                this.cropper.destroy();
            }
            
            // Инициализируем Cropper.js
            this.cropper = new Cropper(cropImage, {
                aspectRatio: 1,
                viewMode: 1,
                autoCropArea: 0.8,
                responsive: true,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
                background: false,
            });
            console.log('Cropper initialized');
        };

        reader.onerror = (e) => {
            console.error('Error reading file:', e);
        };

        reader.readAsDataURL(file);
    }

    closeCropModal() {
        const cropModal = document.getElementById('crop-modal');
        cropModal.classList.add('hidden');
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
        
        // Сбрасываем значение файлового ввода
        const avatarInput = document.getElementById('avatar');
        if (avatarInput) {
            avatarInput.value = '';
        }
        console.log('Crop modal closed');
    }

    cropImage() {
        if (!this.cropper) {
            console.error('No cropper instance');
            return;
        }

        console.log('Cropping image...');
        const canvas = this.cropper.getCroppedCanvas({
            width: 256,
            height: 256,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });

        // Показываем превью
        const avatarPreview = document.getElementById('avatar-preview');
        avatarPreview.src = canvas.toDataURL('image/png');

        // Сохраняем данные обрезки для отправки на сервер
        const cropData = this.cropper.getData();
        const cropDataInput = document.getElementById('crop-data');
        cropDataInput.value = JSON.stringify(cropData);

        console.log('Image cropped successfully, crop data:', cropData);
        this.closeCropModal();
        
        // Показываем уведомление
        this.showMessage('Аватарка обрезана. Нажмите "Сохранить изменения" для применения.', 'success');
    }
    
    showMessage(text, type) {
        // Удаляем существующие сообщения
        const existingMessages = document.querySelectorAll('.avatar-message');
        existingMessages.forEach(msg => msg.remove());
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'avatar-message';
        messageDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#19cf86' : '#e0245e'};
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-weight: bold;
        `;
        messageDiv.textContent = text;
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            if (document.body.contains(messageDiv)) {
                document.body.removeChild(messageDiv);
            }
        }, 3000);
    }
}

// Инициализация когда DOM загружен
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing avatar editor...');
    window.avatarEditor = new AvatarEditor();
});