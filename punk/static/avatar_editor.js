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
            cropImage.src = e.target.result;
            cropModal.classList.remove('hidden');
            
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
    }

    cropImage() {
        if (!this.cropper) return;

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

        this.closeCropModal();
    }
}

// Инициализация когда DOM загружен
document.addEventListener('DOMContentLoaded', function() {
    window.avatarEditor = new AvatarEditor();
});