// Smart Claims App - Main JavaScript Logic
class SmartClaimsApp {
    constructor() {
        this.apiBase = '/api';
        this.currentClaim = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadInitialData();
    }

    bindEvents() {
        // Upload form submission
        document.getElementById('uploadForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFileUpload();
        });
    }

    async loadInitialData() {
        await this.refreshQueue();
    }

    // API Helper Methods
    async apiCall(endpoint, options = {}) {
        try {
            const response = await fetch(`${this.apiBase}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    // Claims Queue Management
    async refreshQueue() {
        try {
            const queueContent = document.getElementById('queueContent');
            queueContent.innerHTML = '<div class="text-center text-muted py-4"><i class="fas fa-spinner fa-spin fa-2x mb-3"></i><p>Loading claims queue...</p></div>';

            const response = await this.apiCall('/claims/pending');
            
            if (response.success && response.data.length > 0) {
                this.renderClaimsQueue(response.data);
            } else {
                queueContent.innerHTML = `
                    <div class="text-center text-muted py-4">
                        <i class="fas fa-inbox fa-2x mb-3"></i>
                        <p>No pending claims found</p>
                        <small>Upload documents to create your first claim</small>
                    </div>
                `;
            }
        } catch (error) {
            this.showError('Failed to load claims queue', error.message);
        }
    }

    renderClaimsQueue(claims) {
        const queueContent = document.getElementById('queueContent');
        
        const claimsHtml = claims.map(claim => `
            <div class="card claim-card mb-3" onclick="app.viewClaimDetails('${claim.id}')">
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-md-3">
                            <h6 class="mb-1">${claim.patientName}</h6>
                            <small class="text-muted">${claim.insurer}</small>
                        </div>
                        <div class="col-md-3">
                            <span class="badge bg-secondary">${claim.claimSubtype || 'Unknown'}</span>
                            <br>
                            <small class="text-muted">${claim.documentCount} documents</small>
                        </div>
                        <div class="col-md-3">
                            <span class="text-muted">Submitted</span><br>
                            <small>${new Date(claim.submittedAt).toLocaleDateString()}</small>
                        </div>
                        <div class="col-md-3 text-end">
                            ${claim.flagsCount > 0 ? 
                                `<span class="badge bg-warning flags-badge">${claim.flagsCount} flags</span>` : 
                                '<span class="badge bg-success">No issues</span>'
                            }
                            <br>
                            <small class="text-muted">Ready for review</small>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        queueContent.innerHTML = claimsHtml;
    }

    // File Upload Handling
    async handleFileUpload() {
        const formData = new FormData();
        const patientName = document.getElementById('patientName').value;
        const insurer = document.getElementById('insurer').value;
        const documents = document.getElementById('documents').files;

        if (!patientName || !insurer || documents.length === 0) {
            this.showError('Validation Error', 'Please fill in all required fields and select documents.');
            return;
        }

        formData.append('patientName', patientName);
        formData.append('insurer', insurer);
        
        for (let i = 0; i < documents.length; i++) {
            formData.append('documents', documents[i]);
        }

        try {
            this.showUploadProgress();
            
            const response = await fetch(`${this.apiBase}/upload/claim`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                this.showSuccess('Claim Created', `Claim created successfully with ${result.data.documentsUploaded} documents.`);
                this.hideUploadProgress();
                this.resetUploadForm();
                await this.refreshQueue();
                
                // Switch to queue tab
                document.getElementById('queue-tab').click();
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            this.showError('Upload Failed', error.message);
            this.hideUploadProgress();
        }
    }

    showUploadProgress() {
        document.getElementById('uploadProgress').classList.remove('d-none');
        document.getElementById('uploadForm').classList.add('d-none');
    }

    hideUploadProgress() {
        document.getElementById('uploadProgress').classList.add('d-none');
        document.getElementById('uploadForm').classList.remove('d-none');
    }

    resetUploadForm() {
        document.getElementById('uploadForm').reset();
    }

    // Utility Methods
    showSuccess(title, message) {
        this.showNotification('success', title, message);
    }

    showError(title, message) {
        this.showNotification('danger', title, message);
    }

    showNotification(type, title, message) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            <strong>${title}</strong><br>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new SmartClaimsApp();
});

// Global functions for onclick handlers
window.refreshQueue = () => app.refreshQueue(); 