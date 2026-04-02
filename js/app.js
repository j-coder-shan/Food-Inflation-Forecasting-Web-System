document.addEventListener('DOMContentLoaded', () => {
    // --- Typing Effect ---
    const textToType = "Predict future inflation accurately.";
    const typingElement = document.getElementById('typing-text');
    let i = 0;
    
    function typeWriter() {
        if (i < textToType.length) {
            typingElement.innerHTML += textToType.charAt(i);
            i++;
            setTimeout(typeWriter, 50);
        }
    }
    
    // Start typing effect after a small delay
    setTimeout(typeWriter, 500);


    // --- Drag and Drop Logic ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadStatus = document.getElementById('upload-status');
    const fileNameDisplay = document.getElementById('file-name');
    const progressBar = document.getElementById('progressBar'); // wait, the ID in HTML is progress-bar
    const progressBarEl = document.getElementById('progress-bar');
    const validationMessage = document.getElementById('validation-message');
    const removeFileBtn = document.getElementById('remove-file-btn');
    const modelSelectionBtn = document.getElementById('model-selection-btn');
    
    const previewPanel = document.getElementById('preview-panel');
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');
    const rowCountBadge = document.getElementById('row-count-badge');

    let currentFile = null;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Highlight drop zone
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('dragover');
        }, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    // Handle file input selection
    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    // Remove file
    removeFileBtn.addEventListener('click', resetUpload);

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            const validTypes = ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
            
            // Check file extension just in case MIME is weird
            const ext = file.name.split('.').pop().toLowerCase();
            if (!validTypes.includes(file.type) && ext !== 'csv' && ext !== 'xlsx' && ext !== 'xls') {
                showError("Invalid file type. Please upload a .csv or .xlsx file.");
                return;
            }

            currentFile = file;
            startUploadProcess(file);
        }
    }

    function startUploadProcess(file) {
        // UI Reset
        uploadStatus.classList.remove('hidden');
        fileNameDisplay.textContent = file.name;
        progressBarEl.style.width = '0%';
        validationMessage.innerHTML = '';
        validationMessage.className = 'validation-message';
        previewPanel.classList.add('hidden');
        modelSelectionBtn.classList.add('disabled');
        modelSelectionBtn.disabled = true;

        // Simulate upload progress
        let width = 0;
        const interval = setInterval(() => {
            if (width >= 100) {
                clearInterval(interval);
                processFile(file);
            } else {
                width += 10;
                progressBarEl.style.width = width + '%';
            }
        }, 50);
    }

    function processFile(file) {
        validationMessage.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validating dataset...';
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Convert to array of arrays
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                validateAndPreviewData(jsonData, file);
                
            } catch (error) {
                console.error(error);
                showError("Failed to parse the file. Ensure it's a valid CSV/XLSX.");
            }
        };

        reader.readAsArrayBuffer(file);
    }

    function validateAndPreviewData(data, file) {
        if (data.length === 0) {
            showError("The dataset is empty.");
            return;
        }

        const headers = data[0].map(h => String(h).trim().toLowerCase());
        
        // Find required columns
        const monthIndex = headers.findIndex(h => h === 'month');
        const valueIndex = headers.findIndex(h => h.includes('index') || h === 'price_index');

        if (monthIndex === -1 || valueIndex === -1) {
            showError("Validation Failed: Dataset must contain 'Month' and 'Index' columns.");
            return;
        }

        // Success
        showSuccess(`Validation Successful. Found ${data.length - 1} records.`);
        
        // Prepare backend upload
        uploadToBackend(file);

        // Render Preview (Max 5 rows)
        renderPreview(data);
    }

    function renderPreview(data) {
        tableHeader.innerHTML = '';
        tableBody.innerHTML = '';

        const headers = data[0];
        headers.forEach(h => {
            const th = document.createElement('th');
            th.textContent = h;
            tableHeader.appendChild(th);
        });

        // Rows (up to 5)
        const rowCount = Math.min(6, data.length); // 1 header + 5 rows
        for (let i = 1; i < rowCount; i++) {
            const tr = document.createElement('tr');
            const rowData = data[i];
            
            headers.forEach((_, colIndex) => {
                const td = document.createElement('td');
                td.textContent = rowData[colIndex] !== undefined ? rowData[colIndex] : '';
                tr.appendChild(td);
            });
            tableBody.appendChild(tr);
        }

        rowCountBadge.textContent = `${data.length - 1} Total Rows`;
        previewPanel.classList.remove('hidden');

        // Enable Navigation
        modelSelectionBtn.classList.remove('disabled');
        modelSelectionBtn.disabled = false;
    }

    function showError(msg) {
        validationMessage.className = 'validation-message error';
        validationMessage.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
        progressBarEl.style.background = 'var(--error-color)';
    }

    function showSuccess(msg) {
        validationMessage.className = 'validation-message success';
        validationMessage.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${msg}`;
        progressBarEl.style.background = 'var(--success-color)';
    }

    function resetUpload() {
        currentFile = null;
        fileInput.value = '';
        uploadStatus.classList.add('hidden');
        previewPanel.classList.add('hidden');
        progressBarEl.style.width = '0%';
        progressBarEl.style.background = 'linear-gradient(90deg, var(--primary-color), var(--accent-color))';
        modelSelectionBtn.classList.add('disabled');
        modelSelectionBtn.disabled = true;
    }

    // Backend Implementation (Dummy)
    async function uploadToBackend(file) {
        console.log("Preparing to send file to backend API...");
        const formData = new FormData();
        formData.append('dataset', file);
        
        /* 
        // Actual fetch call when backend is ready
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            console.log("Upload successful", result);
        } catch(err) {
            console.error("Backend upload failed", err);
        }
        */
    }
});
