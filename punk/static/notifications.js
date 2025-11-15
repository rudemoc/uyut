// static/notifications.js
class Notifications {
    constructor() {
        this.notifications = [];
        this.recentChats = [];
        this.init();
    }

    async init() {
        await this.loadNotifications();
        await this.loadRecentChats();
        this.setupEventListeners();
        this.startPolling();
    }

    async loadNotifications() {
        try {
            const res = await fetch('/api/notifications');
            if (!res.ok) throw new Error('Failed to load notifications');
            const data = await res.json();
            this.notifications = data.notifications || [];
            this.renderNotifications();
        } catch (error) {
            console.error('Error loading notifications:', error);
            this.showError('Ошибка загрузки уведомлений');
        }
    }

    async loadRecentChats() {
        try {
            const res = await fetch('/api/recent-chats');
            if (!res.ok) throw new Error('Failed to load recent chats');
            const data = await res.json();
            this.recentChats = data.chats || [];
            this.renderRecentChats();
        } catch (error) {
            console.error('Error loading recent chats:', error);
            this.showError('Ошибка загрузки чатов');
        }
    }

    renderNotifications() {
        const container = document.getElementById('notifications-list');
        if (!container) return;

        if (this.notifications.length === 0) {
            container.innerHTML = '<div class="empty-state">Нет новых уведомлений</div>';
            return;
        }

        container.innerHTML = this.notifications.map(notif => `
            <div class="notification-item" data-user-id="${notif.from_user_id}">
                <div class="notification-avatar">
                    <img src="/api/user/${notif.from_user_id}/avatar" class="avatar" onerror="this.src='data:image/png;base64,' + defaultAvatar">
                </div>
                <div class="notification-content">
                    <div class="notification-text">
                        <strong>${this.escapeHtml(notif.from_user)}</strong>: ${this.escapeHtml(notif.preview)}
                    </div>
                    <div class="notification-time">${this.formatTime(notif.timestamp)}</div>
                </div>
                <div class="notification-actions">
                    <button class="quick-chat-btn" data-user-id="${notif.from_user_id}" title="Написать сообщение">💬</button>
                </div>
            </div>
        `).join('');

        // Обработчики для уведомлений
        container.querySelectorAll('.notification-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Если клик не по кнопке быстрого чата
                if (!e.target.classList.contains('quick-chat-btn')) {
                    const userId = item.dataset.userId;
                    this.openUserProfile(userId);
                }
            });
        });

        // Обработчики для кнопок быстрого чата
        container.querySelectorAll('.quick-chat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const userId = btn.dataset.userId;
                this.startDirectMessage(userId);
            });
        });
    }

    renderRecentChats() {
        const container = document.getElementById('recent-chats-list');
        if (!container) return;

        if (this.recentChats.length === 0) {
            container.innerHTML = '<div class="empty-state">Нет активных чатов</div>';
            return;
        }

        container.innerHTML = this.recentChats.map(chat => `
            <div class="chat-item" data-user-id="${chat.user_id}">
                <img src="data:image/png;base64,${chat.avatar}" class="avatar" onerror="this.src='data:image/png;base64,' + defaultAvatar">
                <div class="chat-info">
                    <div class="chat-name">${this.escapeHtml(chat.display_name)}</div>
                    <div class="chat-preview">${this.escapeHtml(chat.last_message)}</div>
                </div>
                <div class="chat-time">${this.formatTime(chat.timestamp)}</div>
            </div>
        `).join('');

        container.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => {
                const userId = item.dataset.userId;
                this.startDirectMessage(userId);
            });
        });
    }

    openUserProfile(userId) {
        window.open(`/user/${userId}`, '_blank');
    }

    startDirectMessage(userId) {
        window.location.href = `/direct_message/${userId}`;
    }

    formatTime(timestamp) {
        if (!timestamp) return 'давно';
        
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diff = now - date;

        if (diff < 60 * 1000) return 'только что';
        if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))} мин назад`;
        if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))} ч назад`;
        
        return date.toLocaleDateString();
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #e0245e;
            color: white;
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 10000;
            font-weight: bold;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (document.body.contains(errorDiv)) {
                document.body.removeChild(errorDiv);
            }
        }, 3000);
    }

    setupEventListeners() {
        const tabButtons = document.querySelectorAll('.tab-button');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(tab => {
            tab.classList.add('hidden');
        });
        
        document.getElementById(`${tabName}-tab`).classList.remove('hidden');
        
        document.querySelectorAll('.tab-button').forEach(button => {
            button.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    }

    startPolling() {
        setInterval(() => {
            this.loadNotifications();
            this.loadRecentChats();
        }, 30000);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    window.notifications = new Notifications();
});