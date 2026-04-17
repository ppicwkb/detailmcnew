
        const API_KEY = "AIzaSyBhiKDVDH4fle5_EqAIaA05YjpxVMEBYZM"; // WARNING: This key is public. For production, use a backend proxy.
        const SHEET_ID = "1jeVUjgFmTDVNsOGbKgb9Lglp8guMCTh-bNapK9owO8k";
        const SHEET_NAME = "DETAIL";
        
        let allData = [];
        let filteredData = [];
        let currentPage = 1;
        let itemsPerPage = 20;
        let debounceTimer;
        
        async function getLastModified() {
            try {
                const driveUrl = `https://www.googleapis.com/drive/v3/files/${SHEET_ID}?fields=modifiedTime&key=${API_KEY}`;
                const response = await fetch(driveUrl);
                if (!response.ok) throw new Error('Failed to fetch file metadata');
                
                const fileInfo = await response.json();
                const modifiedDate = new Date(fileInfo.modifiedTime);
                const formattedDate = modifiedDate.toLocaleString('id-ID', {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
                });
                document.getElementById('lastModified').textContent = `Updated: ${formattedDate} WIB`;
            } catch (error) {
                console.error('Error getting last modified:', error);
                document.getElementById('lastModified').textContent = `Update info unavailable`;
            }
        }

        async function loadData() {
            showLoading(true);
            hideError();
            
            try {
                const sheetUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${SHEET_NAME}?key=${API_KEY}`;
                const [_, response] = await Promise.all([getLastModified(), fetch(sheetUrl)]);
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`HTTP ${response.status}: ${errorData.error.message}`);
                }
                
                const data = await response.json();
                if (!data.values || data.values.length < 2) {
                    throw new Error('No data found in the spreadsheet or sheet is empty.');
                }
                
                processData(data.values);
                populateFilters();
                initInterconnectedFilters();
                applyFilters();
                updateDashboard();
                
            } catch (error) {
                console.error('Error loading data:', error);
                showError(`Failed to load data. Please check if the Google Sheet is public and the configuration is correct. (Error: ${error.message})`);
            } finally {
                showLoading(false);
            }
        }
        
        function processData(rawData) {
            const headers = rawData[0].map(h => (h || '').trim().toUpperCase());
            const rows = rawData.slice(1);
            
            const col = {
                produkId: headers.indexOf('PRODUK ID'),
                packing: headers.indexOf('PACKING'),
                brand: headers.indexOf('BRAND'),
                po: headers.indexOf('PO'),
                saldo: headers.indexOf('SALDO'),
                kg: headers.indexOf('KG'),
                raw: headers.indexOf('RAW')
            };

            if (col.produkId === -1 || col.saldo === -1) {
                throw new Error("Essential columns 'PRODUK ID' or 'SALDO' not found in the sheet.");
            }
            
            const groupedData = new Map();
            
            rows.forEach(row => {
                if (!row || row.length === 0 || !row[col.produkId]) return;
                
                const rawValue = (row[col.raw] || '').toUpperCase();
                let location = 'WKB';
                if (rawValue.includes('GIM')) location = 'GIM';
                else if (rawValue.includes('CONT')) location = 'CONT';
                
                const produkId = (row[col.produkId] || '').trim();
                const packing = (row[col.packing] || '').trim();
                const brand = (row[col.brand] || '').trim();
                const po = (row[col.po] || '').trim();

                // Robust number parsing
                const saldo = parseFloat(String(row[col.saldo] || '0').replace(/[^0-9.-]+/g,"")) || 0;
                const kg = parseFloat(String(row[col.kg] || '0').replace(/,/g, '.').replace(/[^0-9.-]+/g,"")) || 0;
                
                const uniqueKey = `${produkId}|${packing}|${brand}|${po}|${location}`;
                
                if (groupedData.has(uniqueKey)) {
                    const existing = groupedData.get(uniqueKey);
                    existing.saldo += saldo;
                    existing.kg += kg;
                } else {
                    groupedData.set(uniqueKey, { produkId, packing, brand, po, saldo, kg, location });
                }
            });
            
            allData = Array.from(groupedData.values());
        }
        
        function setupEventListeners() {
            document.getElementById('globalSearch').addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(applyFilters, 300);
            });
        }
        
        function populateFilters() {
            const createOptions = (key) => [...new Set(allData.map(item => item[key]).filter(Boolean))].sort();
            populateDatalist('produkList', createOptions('produkId'));
            populateDatalist('packingList', createOptions('packing'));
            populateDatalist('brandList', createOptions('brand'));
            populateDatalist('poList', createOptions('po'));
        }
        
        
        // ========================
// 🔄 INTERCONNECTED FILTER
// ========================
function initInterconnectedFilters() {
    // Event listener tiap filter input
    ['searchProduk', 'searchPacking', 'searchBrand', 'searchPO', 'filterLocation']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', updateConnectedFilters);
        });
}

function updateConnectedFilters() {
    const selected = {
        produkId: document.getElementById('searchProduk').value.trim().toLowerCase(),
        packing: document.getElementById('searchPacking').value.trim().toLowerCase(),
        brand: document.getElementById('searchBrand').value.trim().toLowerCase(),
        po: document.getElementById('searchPO').value.trim().toLowerCase(),
        location: document.getElementById('filterLocation').value.trim().toLowerCase()
    };

    // Saring data sesuai filter aktif
    let filtered = allData.filter(item =>
        (!selected.produkId || item.produkId.toLowerCase().includes(selected.produkId)) &&
        (!selected.packing || item.packing.toLowerCase().includes(selected.packing)) &&
        (!selected.brand || item.brand.toLowerCase().includes(selected.brand)) &&
        (!selected.po || item.po.toLowerCase().includes(selected.po)) &&
        (!selected.location || item.location.toLowerCase() === selected.location)
    );

    // Isi ulang daftar opsi berdasarkan hasil filter
    populateConnectedOptions(filtered);
}

// Mengisi ulang opsi filter berdasarkan data hasil penyaringan
function populateConnectedOptions(filtered) {
    const createOptions = (key) => [...new Set(filtered.map(item => item[key]).filter(Boolean))].sort();
    populateDatalist('produkList', createOptions('produkId'));
    populateDatalist('packingList', createOptions('packing'));
    populateDatalist('brandList', createOptions('brand'));
    populateDatalist('poList', createOptions('po'));
}
        
        
        
        
        
        const populateDatalist = (id, options) => {
            const list = document.getElementById(id);
            list.innerHTML = options.map(opt => `<option value="${opt}"></option>`).join('');
        };
        
        function applyFilters() {
            const getVal = id => document.getElementById(id).value.trim().toLowerCase();
            const filters = {
                produkId: getVal('searchProduk'),
                packing: getVal('searchPacking'),
                brand: getVal('searchBrand'),
                po: getVal('searchPO'),
                location: getVal('filterLocation'),
                global: getVal('globalSearch')
            };
            
            filteredData = allData.filter(item => {
                const globalMatch = filters.global === '' || Object.values(item).some(val => String(val).toLowerCase().includes(filters.global));
                return globalMatch &&
                    (filters.produkId === '' || (item.produkId || '').toLowerCase().includes(filters.produkId)) &&
                    (filters.packing === '' || (item.packing || '').toLowerCase().includes(filters.packing)) &&
                    (filters.brand === '' || (item.brand || '').toLowerCase().includes(filters.brand)) &&
                    (filters.po === '' || (item.po || '').toLowerCase().includes(filters.po)) &&
                    (filters.location === '' || (item.location || '').toLowerCase() === filters.location);
            });
            
            currentPage = 1;
            displayData();
            updateStats();
        }
        
        function clearFilters() {
            ['globalSearch', 'searchProduk', 'searchPacking', 'searchBrand', 'searchPO', 'filterLocation'].forEach(id => {
                document.getElementById(id).value = '';
            });
            applyFilters();
        }
        
        function displayData() {
            const dataDisplay = document.getElementById('dataDisplay');
            if (filteredData.length === 0) {
                dataDisplay.style.display = 'none';
                return;
            }
            dataDisplay.style.display = 'block';
            
            const totalPages = Math.ceil(filteredData.length / itemsPerPage);
            const startIndex = (currentPage - 1) * itemsPerPage;
            const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);
            
            const tableBody = document.getElementById('tableBody');
            tableBody.innerHTML = paginatedData.map(item => `
                <tr>
                    <td>${item.produkId}</td>
                    <td>${item.packing}</td>
                    <td>${item.brand}</td>
                    <td>${item.po}</td>
                    <td>${item.saldo.toLocaleString('id-ID')}</td>
                    <td>${item.kg.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                    <td><span class="location-badge ${item.location.toLowerCase()}">${item.location}</span></td>
                </tr>
            `).join('');
            
            updatePaginationControls(totalPages);
        }
        
        function updatePaginationControls(totalPages) {
            const container = document.getElementById('paginationContainer');
            if (totalPages <= 1) {
                container.innerHTML = '';
                return;
            }
            
            let html = `<button id="prevBtn" onclick="changePage(-1)" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Prev</button>`;
            
            // Simplified pagination logic
            const pagesToShow = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
            let lastPage = 0;
            for (let i = 1; i <= totalPages; i++) {
                if (pagesToShow.has(i)) {
                    if (i - lastPage > 1) html += `<span>...</span>`;
                    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
                    lastPage = i;
                }
            }
            
            html += `<button id="nextBtn" onclick="changePage(1)" ${currentPage === totalPages ? 'disabled' : ''}>Next &raquo;</button>`;
            container.innerHTML = html;
        }
        
        const changePage = (dir) => goToPage(currentPage + dir);
        const goToPage = (num) => {
            const totalPages = Math.ceil(filteredData.length / itemsPerPage);
            if (num >= 1 && num <= totalPages) {
                currentPage = num;
                displayData();
            }
        };
        
        function updateStats() {
            const formatNumber = (num, digits = 0) => num.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: 2 });
            document.getElementById('totalSaldo').textContent = formatNumber(filteredData.reduce((sum, item) => sum + (item.saldo || 0), 0));
            document.getElementById('totalKg').textContent = formatNumber(filteredData.reduce((sum, item) => sum + (item.kg || 0), 0), 2);
            document.getElementById('uniqueBrands').textContent = new Set(filteredData.map(item => item.brand)).size;
            document.getElementById('uniqueLocations').textContent = new Set(filteredData.map(item => item.location)).size;
        }
        
        function updateDashboard() {
            if (allData.length === 0) return;
            
            const stats = { WKB: { saldo: 0, kg: 0 }, GIM: { saldo: 0, kg: 0 } };
            
            allData.forEach(item => {
                if (stats[item.location]) {
                    stats[item.location].saldo += item.saldo || 0;
                    stats[item.location].kg += item.kg || 0;
                }
            });
            
            const total = { 
                saldo: stats.WKB.saldo + stats.GIM.saldo, 
                kg: stats.WKB.kg + stats.GIM.kg
            };

            const setVal = (id, val, digits = 0) => document.getElementById(id).textContent = val.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: 2 });

            setVal('wkbSaldo', stats.WKB.saldo); setVal('wkbKg', stats.WKB.kg, 2);
            setVal('gimSaldo', stats.GIM.saldo); setVal('gimKg', stats.GIM.kg, 2);
            setVal('totalAllSaldo', total.saldo); setVal('totalAllKg', total.kg, 2);
        }
        
        function exportToExcel() {
            if (filteredData.length === 0) return alert('No data to export');
            const exportData = filteredData.map(item => ({
                'Product ID': item.produkId, 'Packing': item.packing, 'Brand': item.brand, 'PO': item.po,
                'Saldo (Carton)': item.saldo, 'Weight (KG)': item.kg, 'Location': item.location
            }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Inventory");
            XLSX.writeFile(wb, `Inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
        }
        
        function exportToPDF() {
            if (filteredData.length === 0) return alert('No data to export');
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            
            doc.setFontSize(18).text('Inventory Report - CS WKB', 14, 22);
            doc.setFontSize(11).text(`Generated: ${new Date().toLocaleString('id-ID')}`, 14, 30);
            
            doc.autoTable({
                head: [['Product ID', 'Packing', 'Brand', 'PO', 'Saldo', 'KG', 'Location']],
                body: filteredData.map(item => [
                    item.produkId, item.packing, item.brand, item.po,
                    item.saldo.toLocaleString('id-ID'), item.kg.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
                    item.location
                ]),
                startY: 40,
                theme: 'grid',
                headStyles: { fillColor: [30, 41, 59] }
            });
            
            doc.save(`Inventory_${new Date().toISOString().split('T')[0]}.pdf`);
        }
        
        function switchTab(tabName) {
            document.querySelectorAll('.nav-tab, .tab-content').forEach(el => el.classList.remove('active'));
            document.getElementById(`${tabName}Tab`).classList.add('active');
            document.getElementById(`${tabName}Content`).classList.add('active');
            if (tabName === 'dashboard') updateDashboard();
        }

        const showLoading = (show) => document.getElementById('loadingIndicator').style.display = show ? 'block' : 'none';
        const showError = (message) => {
            const el = document.getElementById('errorMessage');
            el.textContent = message;
            el.style.display = 'block';
        };
        const hideError = () => document.getElementById('errorMessage').style.display = 'none';
        
        window.addEventListener('load', () => {
            loadData();
            setupEventListeners();
        });



