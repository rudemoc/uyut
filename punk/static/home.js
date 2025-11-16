class RoomSearch {
    constructor() {
        this.searchInput = document.getElementById('room-search');
        this.resultsContainer = document.getElementById('search-results');
        this.searchTimeout = null;
        this.init();
    }

    init() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', this.handleSearch.bind(this));
            this.searchInput.addEventListener('focus', this.handleFocus.bind(this));
            
            // Touch events for mobile
            this.searchInput.addEventListener('touchstart', (e) => {
                e.stopPropagation();
            }, { passive: true });
        }

        // Close results when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.searchInput?.contains(e.target) && !this.resultsContainer?.contains(e.target)) {
                this.hideResults();
            }
        });

        document.addEventListener('touchstart', (e) => {
            if (!this.searchInput?.contains(e.target) && !this.resultsContainer?.contains(e.target)) {
                this.hideResults();
            }
        }, { passive: true });
    }

    handleSearch(e) {
        const query = e.target.value.trim();
        
        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // Debounce search to avoid too many requests
        this.searchTimeout = setTimeout(() => {
            if (query.length < 1) {
                this.hideResults();
                return;
            }
            this.searchRooms(query);
        }, 300);
    }

    handleFocus() {
        const query = this.searchInput.value.trim();
        if (query.length >= 1) {
            this.searchRooms(query);
        }
    }

    async searchRooms(query) {
        try {
            const response = await fetch(`/api/search-rooms?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            this.displayResults(data.rooms || []);
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    displayResults(rooms) {
        if (!this.resultsContainer) return;

        if (rooms.length === 0) {
            this.resultsContainer.innerHTML = `
                <div class="search-result-item no-results">
                    <div style="text-align: center; color: #8899a6; padding: 20px;">
                        Ничего не найдено
                    </div>
                </div>
            `;
        } else {
            this.resultsContainer.innerHTML = rooms.map(room => `
                <div class="search-result-item" data-code="${room.code}">
                    <div class="search-result-content">
                        <div class="search-result-title">${this.escapeHtml(room.title)}</div>
                        <div class="search-result-meta">
                            <span class="search-result-code">Код: ${room.code}</span>
                            <span class="search-result-members">👥 ${room.members} онлайн</span>
                        </div>
                    </div>
                    <div class="search-result-actions">
                        <button class="join-search-result" data-code="${room.code}">
                            Присоединиться
                        </button>
                    </div>
                </div>
            `).join('');

            // Add click handlers
            this.resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
                const joinButton = item.querySelector('.join-search-result');
                const roomCode = item.dataset.code;
                
                // Click on entire item
                item.addEventListener('click', (e) => {
                    if (e.target !== joinButton) {
                        this.selectRoom(roomCode);
                    }
                });
                
                // Click on join button
                joinButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.selectRoom(roomCode);
                });
                
                // Touch events
                item.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    if (e.target !== joinButton) {
                        this.selectRoom(roomCode);
                    }
                }, { passive: false });
                
                joinButton.addEventListener('touchstart', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    this.selectRoom(roomCode);
                }, { passive: false });
            });
        }

        this.resultsContainer.style.display = 'block';
        this.resultsContainer.classList.add('active');
    }

    selectRoom(roomCode) {
    console.log('Selected room:', roomCode);
    
    // Сначала проверяем, существует ли комната
    fetch(`/api/check-room?code=${encodeURIComponent(roomCode)}`)
        .then(response => response.json())
        .then(data => {
            if (data.exists) {
                // Комната существует - входим в нее
                window.location.href = `/room?room=${roomCode}`;
            } else {
                // Комната не существует - показываем ошибку
                this.showError('Комната не найдена или была удалена');
                this.hideResults();
            }
        })
        .catch(error => {
            console.error('Error checking room:', error);
            this.showError('Ошибка при проверке комнаты');
        });
    
    this.hideResults();
    this.searchInput.value = '';
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
        padding: 12px 24px;
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

    hideResults() {
        if (this.resultsContainer) {
            this.resultsContainer.style.display = 'none';
            this.resultsContainer.classList.remove('active');
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Public rooms functionality
function renderPublicRooms(rooms) {
    const container = document.getElementById('public-rooms');
    if (!container) return;

    if (!rooms.length) {
        container.innerHTML = '<div class="empty-state">Публичных комнат пока нет. Будьте первым!</div>';
        return;
    }
    
    container.innerHTML = '';
    rooms.forEach(r => {
        const item = document.createElement('div');
        item.className = 'room-item';
        item.innerHTML = `
            <div class="room-content">
                <div class="room-title"><strong>${r.title}</strong></div>
                <div class="room-meta">
                    <span class="room-code">Код: ${r.code}</span>
                    <span class="room-members">👥 ${r.members} онлайн</span>
                </div>
            </div>
            <button type="button" class="join-public" data-code="${r.code}">
                Присоединиться
            </button>
        `;
        
        const button = item.querySelector('button.join-public');
        button.addEventListener('click', () => this.joinPublicRoom(r.code));
        button.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.joinPublicRoom(r.code);
        }, { passive: false });
        
        container.appendChild(item);
    });
}

function joinPublicRoom(code) {
    const codeInput = document.getElementById('code');
    if (codeInput) {
        codeInput.value = code;
        const joinButton = document.getElementById('join-button');
        if (joinButton) {
            joinButton.click();
        }
    }
}

async function fetchPublicRooms() {
    try {
        const res = await fetch('/api/public-rooms');
        const data = await res.json();
        renderPublicRooms(data.rooms || []);
    } catch (e) {
        console.log('[PublicRooms] fetch error', e);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize search
    window.roomSearch = new RoomSearch();
    
    // Load and refresh public rooms
    fetchPublicRooms();
    setInterval(fetchPublicRooms, 10000); // Update every 10 seconds
});