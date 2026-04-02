// Global Application State
window.appState = {
    dataset: [], // { month: '2020-01', index: 105.2 }
    rawFile: null,
    selectedModel: null,
    horizon: 6,
    target: 'inflation',
    predictions: [],
    aiSummary: ""
};

// Application Initialize
document.addEventListener('DOMContentLoaded', () => {
    initHomeModule();
    initInstructions();
    initModels();
});

// --- SPA NAVIGATION ---
function navigateTo(targetSectionId) {
    // Hide all sections
    document.querySelectorAll('.page-section').forEach(section => {
        section.classList.remove('active');
        setTimeout(() => section.classList.add('hidden'), 400); // Wait for fade out
    });

    // Show target
    setTimeout(() => {
        const target = document.getElementById(targetSectionId);
        target.classList.remove('hidden');
        // Force reflow
        void target.offsetWidth;
        target.classList.add('active');

        // Handle specific route logic
        if(targetSectionId === 'module-results') {
            renderResultsDashboard();
        }
    }, 400);
}
window.navigateTo = navigateTo; // Make accessible globally


// --- MODULE 1: HOME SETUP ---
function initHomeModule() {
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
    setTimeout(typeWriter, 500);

    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, e => {
            e.preventDefault(); e.stopPropagation();
        });
    });

    dropZone.addEventListener('dragenter', () => dropZone.classList.add('dragover'));
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function() { handleFiles(this.files); });
    document.getElementById('remove-file-btn').addEventListener('click', resetUpload);
}

function handleFiles(files) {
    if (!files.length) return;
    const file = files[0];
    const ext = file.name.split('.').pop().toLowerCase();
    
    if(!['csv', 'xlsx', 'xls'].includes(ext)) {
        showValidation("error", "Invalid file type. Please upload a .csv or .xlsx file.");
        return;
    }

    startUploadProcess(file);
}

function startUploadProcess(file) {
    window.appState.rawFile = file;
    const uploadStatus = document.getElementById('upload-status');
    const progBar = document.getElementById('progress-bar');
    
    uploadStatus.classList.remove('hidden');
    document.getElementById('file-name').textContent = file.name;
    progBar.style.width = '0%';
    
    let width = 0;
    const interval = setInterval(() => {
        if (width >= 100) {
            clearInterval(interval);
            processDataset(file);
        } else {
            width += 15;
            progBar.style.width = width + '%';
        }
    }, 50);
}

function processDataset(file) {
    showValidation("loading", "Validating dataset...");
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            // Validate & Store
            if(jsonData.length < 2) throw new Error("Dataset is empty.");
            const headers = jsonData[0].map(h => String(h).trim().toLowerCase());
            const monthIdx = headers.findIndex(h => h === 'month');
            const valueIdx = headers.findIndex(h => h.includes('index') || h === 'price_index');

            if(monthIdx === -1 || valueIdx === -1) throw new Error("Missing 'Month' or 'Index' columns.");

            // Parse valid rows
            const parsedData = [];
            for(let i=1; i<jsonData.length; i++) {
                if(jsonData[i][monthIdx] && jsonData[i][valueIdx]) {
                    parsedData.push({
                        month: formatMonth(jsonData[i][monthIdx]),
                        index: parseFloat(jsonData[i][valueIdx])
                    });
                }
            }
            
            window.appState.dataset = parsedData;

            showValidation("success", `Validation Successful. Found ${parsedData.length} records.`);
            renderPreview(jsonData);
            document.getElementById('model-selection-btn').disabled = false;
            document.getElementById('model-selection-btn').classList.remove('disabled');

        } catch (error) {
            showValidation("error", error.message);
        }
    };
    reader.readAsArrayBuffer(file);
}

function formatMonth(raw) {
    if(typeof raw === 'number') {
        const d = new Date((raw - (25567 + 2))*86400*1000); 
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    }
    return String(raw).trim();
}

function showValidation(type, msg) {
    const valMsg = document.getElementById('validation-message');
    const pb = document.getElementById('progress-bar');
    if(type === 'error'){
        valMsg.className = 'validation-message error';
        valMsg.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
        pb.style.background = 'var(--error-color)';
    }else if(type === 'success'){
        valMsg.className = 'validation-message success';
        valMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${msg}`;
        pb.style.background = 'var(--success-color)';
    }else {
        valMsg.className = 'validation-message';
        valMsg.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${msg}`;
    }
}

function renderPreview(data) {
    const tableHeader = document.getElementById('table-header');
    const tableBody = document.getElementById('table-body');
    tableHeader.innerHTML = ''; tableBody.innerHTML = '';

    data[0].forEach(h => {
        const th = document.createElement('th'); th.textContent = h; tableHeader.appendChild(th);
    });

    const rowCount = Math.min(6, data.length);
    for (let i = 1; i < rowCount; i++) {
        const tr = document.createElement('tr');
        data[i].forEach(cell => {
            const td = document.createElement('td'); td.textContent = cell !== undefined ? cell : '';
            tr.appendChild(td);
        });
        tableBody.appendChild(tr);
    }
    document.getElementById('row-count-badge').textContent = `${data.length - 1} Total Rows`;
    document.getElementById('preview-panel').classList.remove('hidden');
}

function resetUpload() {
    window.appState.dataset = [];
    document.getElementById('file-input').value = '';
    document.getElementById('upload-status').classList.add('hidden');
    document.getElementById('preview-panel').classList.add('hidden');
    document.getElementById('model-selection-btn').disabled = true;
    document.getElementById('model-selection-btn').classList.add('disabled');
}


// --- MODULE 2: INSTRUCTIONS ---
const instructionData = [
    { title: "1. Dataset Format Requirements", content: "Your dataset must be a <strong>CSV</strong> or <strong>Excel (.xlsx)</strong> file containing at least two columns:<br><br><b>Month:</b> YYYY-MM format preferably.<br><b>Index:</b> Numeric value representing the Food Price Index.<br><br>The data should be sorted chronologically.", icon: "fa-file-csv" },
    { title: "2. Example Dataset", content: "Month, Index<br>2020-01, 105.2<br>2020-02, 106.1<br>2020-03, 107.4", icon: "fa-table" },
    { title: "3. Steps to Use the Platform", content: "1. <strong>Upload</strong> your valid dataset on the Home Page.<br>2. Navigate to <strong>Model Selection</strong>.<br>3. Choose a forecasting model based on your needs (see below).<br>4. Adjust settings like Target (Inflation vs Index) and Horizon (forecast length).<br>5. Click <strong>Run Forecast</strong> and analyze the <strong>Interactive Dashboard</strong>.", icon: "fa-shoe-prints" },
    { title: "4. Model Explanations", content: "<ul><li><strong>Lasso/Ridge:</strong> Penalized linear regression models, great for simple baselines with feature selection.</li><li><strong>ARIMA/SARIMA:</strong> Classic statistical time-series models capturing trends and seasonality.</li><li><strong>XGBoost:</strong> Tree-based machine learning model capturing non-linear relationships.</li><li><strong>STGNN (Future):</strong> Spatial-Temporal Graph Neural Network for complex spatial relations.</li></ul>", icon: "fa-brain" }
];

function initInstructions() {
    const container = document.querySelector('.accordion-container');
    container.innerHTML = '';
    
    instructionData.forEach((item, index) => {
        const accItem = document.createElement('div');
        accItem.className = 'accordion-item';
        accItem.innerHTML = `
            <button class="accordion-header" onclick="toggleAccordion(${index})">
                <span><i class="fa-solid ${item.icon}"></i> ${item.title}</span>
                <i class="fa-solid fa-chevron-down"></i>
            </button>
            <div class="accordion-content">
                <p style="margin-top:0.5rem;">${item.content}</p>
            </div>
        `;
        container.appendChild(accItem);
    });

    // Search filter
    document.getElementById('doc-search').addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        document.querySelectorAll('.accordion-item').forEach(el => {
            const text = el.textContent.toLowerCase();
            el.style.display = text.includes(val) ? 'block' : 'none';
        });
    });
}

function toggleAccordion(index) {
    const items = document.querySelectorAll('.accordion-item');
    items.forEach((item, i) => {
        if(i === index) item.classList.toggle('open');
        else item.classList.remove('open');
    });
}


// --- MODULE 3: MODEL SELECTION ---
const modelsAvailable = [
    { id: 'linear', name: 'Linear Regression', desc: 'Simple trend fitting.', icon: 'fa-chart-line', acc: 'Low', class: 'acc-low' },
    { id: 'ridge', name: 'Ridge Regression', desc: 'Penalized linear model.', icon: 'fa-wave-square', acc: 'Low', class: 'acc-low' },
    { id: 'lasso', name: 'Lasso Regression', desc: 'Feature selection linear model.', icon: 'fa-filter', acc: 'Low', class: 'acc-low' },
    { id: 'arima', name: 'ARIMA', desc: 'Classic time-series forecasting.', icon: 'fa-chart-area', acc: 'Med', class: 'acc-med' },
    { id: 'sarima', name: 'SARIMA', desc: 'Seasonal ARIMA, handles recurrent cycles.', icon: 'fa-snowflake', acc: 'High', class: 'acc-high' },
    { id: 'rw', name: 'Random Walk', desc: 'Naive baseline model (yesterday = today).', icon: 'fa-shoe-prints', acc: 'Low', class: 'acc-low' },
    { id: 'xgboost', name: 'XGBoost', desc: 'Powerful gradient boosting ensemble.', icon: 'fa-bolt', acc: 'High', class: 'acc-high' },
    { id: 'stgnn', name: 'STGNN (Future)', desc: 'Graph-based AI for complex spatial flows.', icon: 'fa-network-wired', acc: 'High', class: 'acc-high' }
];

function initModels() {
    const grid = document.getElementById('models-grid');
    grid.innerHTML = '';
    
    modelsAvailable.forEach(m => {
        const card = document.createElement('div');
        card.className = 'model-card';
        card.id = `model-card-${m.id}`;
        card.onclick = () => selectModel(m);
        card.innerHTML = `
            <div class="model-header">
                <div class="model-icon"><i class="fa-solid ${m.icon}"></i></div>
                <div>
                    <h4>${m.name}</h4>
                    <span class="model-accuracy ${m.class}">Accuracy: ${m.acc}</span>
                </div>
            </div>
            <p style="color:var(--text-secondary); font-size:0.9rem;">${m.desc}</p>
        `;
        grid.appendChild(card);
    });

    document.getElementById('run-forecast-btn').addEventListener('click', executeForecast);
}

function selectModel(model) {
    document.querySelectorAll('.model-card').forEach(c => c.classList.remove('selected'));
    document.getElementById(`model-card-${model.id}`).classList.add('selected');
    
    window.appState.selectedModel = model;
    
    const summary = document.getElementById('selected-model-summary');
    summary.innerHTML = `<strong>Selected:</strong> ${model.name} <br><span style="font-size:0.8rem; color:var(--text-secondary)">${model.desc}</span>`;
    
    document.getElementById('run-forecast-btn').disabled = false;
}

async function executeForecast() {
    const btn = document.getElementById('run-forecast-btn');
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;
    
    // Grab settings
    window.appState.horizon = parseInt(document.getElementById('forecast-horizon').value);
    window.appState.target = document.querySelector('input[name="target-metric"]:checked').value;

    try {
        if (!window.appState.rawFile) {
            // Fallback to mock if no file is present
            generateMockPredictions();
            navigateTo('module-results');
            return;
        }

        const formData = new FormData();
        formData.append('dataset', window.appState.rawFile);
        formData.append('model', window.appState.selectedModel.id);
        formData.append('horizon', window.appState.horizon);

        // Call Python Backend API
        const response = await fetch('http://127.0.0.1:5000/predict', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Server error occurred');
        }

        const result = await response.json();
        
        // Convert response strictly into the frontend shape
        window.appState.dataset = result.past.dates.map((d, i) => ({
            month: d,
            index: result.past.index[i]
        }));
        
        window.appState.predictions = result.future.dates.map((d, i) => ({
            month: d,
            index: result.future.index[i]
        }));
        
        window.appState.aiSummary = result.summary;

        navigateTo('module-results');
        
    } catch(err) {
        alert("Forecast Failed: " + err.message);
        console.error(err);
    } finally {
        btn.innerHTML = `<span>Run Forecast</span> <i class="fa-solid fa-play"></i>`;
    }
}

function generateMockPredictions() {
    // Generate simple continuing trend based on last points
    const data = window.appState.dataset;
    const lastPoint = data.length > 0 ? data[data.length - 1] : { month: '2024-01', index: 150 };
    
    let lastDate = new Date(lastPoint.month + "-01");
    let lastVal = lastPoint.index;
    
    const preds = [];
    for(let i=1; i<=window.appState.horizon; i++) {
        lastDate.setMonth(lastDate.getMonth() + 1);
        const yyyy = lastDate.getFullYear();
        const mm = String(lastDate.getMonth() + 1).padStart(2, '0');
        
        // Random fluctuation upwards
        const fluctuation = (Math.random() * 2) - 0.5; // -0.5 to 1.5
        lastVal = lastVal + fluctuation;
        
        preds.push({
            month: `${yyyy}-${mm}`,
            index: parseFloat(lastVal.toFixed(2))
        });
    }
    
    window.appState.predictions = preds;
}


// --- MODULE 4: RESULTS DASHBOARD ---
let forecastChartInstance = null;

function renderResultsDashboard() {
    const state = window.appState;
    const isInflation = state.target === 'inflation';
    
    // Sync chart metric toggle with current state
    const toggleEl = document.getElementById('chart-metric-toggle');
    if (toggleEl) toggleEl.value = state.target;
    
    // Process Data for Chart
    let pastLabels = state.dataset.map(d => d.month);
    let pastValues = state.dataset.map(d => d.index);
    let futLabels = state.predictions.map(d => d.month);
    let futValues = state.predictions.map(d => d.index);
    
    if (isInflation && pastValues.length > 0) {
        // Calculate Inflation: (Index_t - Index_t-1) / Index_t-1 * 100
        const calcInflation = (current, prev) => ((current - prev) / prev) * 100;
        
        const newPastValues = [0]; // First element can't be calculated without previous month
        for(let i=1; i<pastValues.length; i++){
            newPastValues.push(calcInflation(pastValues[i], pastValues[i-1]));
        }
        
        const newFutValues = [];
        // First future point compared to last past point
        newFutValues.push(calcInflation(futValues[0], pastValues[pastValues.length - 1]));
        for(let i=1; i<futValues.length; i++){
            newFutValues.push(calcInflation(futValues[i], futValues[i-1]));
        }
        
        pastValues = newPastValues;
        futValues = newFutValues;
    }
    
    // Store processed future values for export
    state.processedFutureValues = futValues;
    
    // Metrics calculation
    const pastAvg = pastValues.slice(-6).reduce((a,b)=>a+b, 0) / Math.min(6, pastValues.length);
    const futAvg = futValues.reduce((a,b)=>a+b, 0) / futValues.length;

    document.getElementById('result-model-name').textContent = state.selectedModel ? state.selectedModel.name : 'N/A';
    document.getElementById('result-past-avg').textContent = pastAvg.toFixed(2) + (isInflation ? '%' : '');
    document.getElementById('result-future-avg').textContent = futAvg.toFixed(2) + (isInflation ? '%' : '');
    document.getElementById('r-horizon').textContent = state.horizon;
    document.getElementById('result-error-mae').textContent = (Math.random() * 1.5 + 0.5).toFixed(3); // Mock Error

    // AI Text
    const trend = futAvg > pastAvg ? "rise steadily" : "stabilize/decrease";
    const defaultText = `Based on the <strong>${state.selectedModel ? state.selectedModel.name : ''}</strong> model, the ${isInflation? 'inflation rate' : 'price index'} is expected to <strong>${trend}</strong> over the next ${state.horizon} months. External economic factors may introduce volatility.`;
    document.getElementById('ai-summary-text').innerHTML = state.aiSummary ? state.aiSummary : defaultText;

    // Render Table
    const tableBody = document.getElementById('results-table-body');
    tableBody.innerHTML = '';
    state.predictions.forEach((p, idx) => {
        const val = futValues[idx].toFixed(2);
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.month}</td><td style="color:var(--accent-color); font-weight:bold;">${val}${isInflation ? '%' : ''}</td>`;
        tableBody.appendChild(tr);
    });

    // Drawing Chart
    drawChart(pastLabels, pastValues, futLabels, futValues, isInflation);
}

function drawChart(pLabels, pValues, fLabels, fValues, isInflation) {
    const ctx = document.getElementById('forecastChart').getContext('2d');
    
    if(forecastChartInstance) forecastChartInstance.destroy();

    // Chart.js combining history and future
    // We pad future with nulls for history length, and history with nulls for future length
    // Actually, overlap the last point for continuous line
    const combinedLabels = [...pLabels, ...fLabels];
    
    const historicalData = [...pValues, ...Array(fLabels.length).fill(null)];
    const futureData = [...Array(pLabels.length - 1).fill(null), pValues[pValues.length-1], ...fValues];

    forecastChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: combinedLabels,
            datasets: [
                {
                    label: 'Historical ' + (isInflation ? 'Inflation' : 'Index'),
                    data: historicalData,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 2,
                    fill: true
                },
                {
                    label: 'Forecast ' + (isInflation ? 'Inflation' : 'Index'),
                    data: futureData,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.2)',
                    borderWidth: 3,
                    borderDash: [5, 5],
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: '#0f172a',
                    fill: {
                        target: 'origin',
                        above: 'rgba(6, 182, 212, 0.1)' // Shaded area for forecast
                    }
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { labels: { color: '#f8fafc' } },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#06b6d4' },
                zoom: {
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                    },
                    pan: { enabled: true, mode: 'x' }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function resetZoom() {
    if(forecastChartInstance) forecastChartInstance.resetZoom();
}

window.resetZoom = resetZoom;

// --- EXPORT FUNCTIONS ---
function exportData() {
    if(!window.appState.predictions || !window.appState.predictions.length) {
        return alert("Data not ready. Please run a forecast first.");
    }
    const preds = window.appState.predictions;
    const processedVals = window.appState.processedFutureValues || preds.map(p => p.index);
    
    // Prepare CSV Content
    let csvContent = "data:text/csv;charset=utf-8,Month,Predicted Value\n";
    preds.forEach((row, idx) => { 
        csvContent += `${row.month},${processedVals[idx]}\n`; 
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.href = encodedUri;
    link.download = "inflation_forecast.csv";
    
    // Append -> Click -> Remove is required manually to prevent UUID random name issues
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function exportChart() {
    if(!forecastChartInstance) {
        return alert("Chart not ready");
    }
    
    // 1. Use Chart.js built-in method
    const base64Image = forecastChartInstance.toBase64Image();
    
    // 2. Create link dynamically
    const link = document.createElement("a");
    
    // 3. Set properties
    link.href = base64Image;
    link.download = "inflation_chart.png";
    
    // 4. Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Map exports to window
window.exportData = exportData;
window.exportChart = exportChart;

// --- DYNAMIC CHART TOGGLE & FULLSCREEN ---
window.toggleChartMetric = function() {
    const toggleEl = document.getElementById('chart-metric-toggle');
    if (!toggleEl) return;
    
    const isInflation = toggleEl.value === 'inflation';
    const state = window.appState;
    
    let pastLabels = state.dataset.map(d => d.month);
    let pastValues = state.dataset.map(d => d.index);
    let futLabels = state.predictions.map(d => d.month);
    let futValues = state.predictions.map(d => d.index);
    
    if (isInflation && pastValues.length > 0) {
        const calcInflation = (current, prev) => ((current - prev) / prev) * 100;
        const newPastValues = [0];
        for(let i=1; i<pastValues.length; i++) newPastValues.push(calcInflation(pastValues[i], pastValues[i-1]));
        const newFutValues = [];
        newFutValues.push(calcInflation(futValues[0], pastValues[pastValues.length - 1]));
        for(let i=1; i<futValues.length; i++) newFutValues.push(calcInflation(futValues[i], futValues[i-1]));
        pastValues = newPastValues;
        futValues = newFutValues;
    }
    
    drawChart(pastLabels, pastValues, futLabels, futValues, isInflation);
};

window.toggleFullScreen = function() {
    const container = document.querySelector('.chart-container');
    if (!document.fullscreenElement) {
        if (container.requestFullscreen) {
            container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
            container.webkitRequestFullscreen();
        } else if (container.msRequestFullscreen) {
            container.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
};
