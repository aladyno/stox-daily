/*
 * Stox Daily — dashboard tĩnh cho GitHub Pages.
 * - Lấy danh sách báo cáo trong folder data/ qua GitHub API (tự cập nhật khi có file mới),
 *   fallback sang data/manifest.json nếu API lỗi / rate-limit.
 * - Đọc từng file báo cáo để trích metadata (regime, kết quả quét, tỷ trọng, độ rộng) hiển thị lên bảng.
 * - Viewer nằm trên cùng, luôn tự load báo cáo ngày mới nhất khi mở trang.
 * - Bấm 1 row trong bảng → viewer đổi sang báo cáo của ngày đó (deep-link bằng #hash).
 */
(function () {
    'use strict';

    var GITHUB_API = 'https://api.github.com/repos/aladyno/stox-daily/contents/data';
    var FILE_PATTERN = /^uptrend-scan-(\d{4}-\d{2}-\d{2})\.html$/;

    var tbody = document.getElementById('report-tbody');
    var viewerFrame = document.getElementById('viewer-frame');

    /* ---------- Lấy danh sách file ---------- */

    function fetchFileList() {
        return fetch(GITHUB_API)
            .then(function (res) {
                if (!res.ok) throw new Error('GitHub API ' + res.status);
                return res.json();
            })
            .then(function (items) {
                return items
                    .map(function (it) { return it.name; })
                    .filter(function (name) { return FILE_PATTERN.test(name); });
            })
            .catch(function () {
                // Fallback: manifest tĩnh (cập nhật khi thêm báo cáo mới)
                return fetch('data/manifest.json')
                    .then(function (res) {
                        if (!res.ok) throw new Error('manifest ' + res.status);
                        return res.json();
                    })
                    .then(function (json) {
                        return (json.files || []).filter(function (name) { return FILE_PATTERN.test(name); });
                    });
            });
    }

    /* ---------- Trích metadata từ từng báo cáo ---------- */

    function textOf(doc, id) {
        var el = doc.getElementById(id);
        return el ? el.textContent.trim() : '';
    }

    function fetchMeta(file) {
        return fetch('data/' + file)
            .then(function (res) {
                if (!res.ok) throw new Error(res.status);
                return res.text();
            })
            .then(function (html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                return {
                    regime: textOf(doc, 'view-regime'),
                    passed: textOf(doc, 'view-passed'),
                    allocation: textOf(doc, 'view-allocation'),
                    breadth: textOf(doc, 'view-breadth')
                };
            })
            .catch(function () { return null; });
    }

    function regimeBadgeClass(regime) {
        var r = (regime || '').toUpperCase();
        if (r.indexOf('RISK-ON') !== -1 || r.indexOf('RISK ON') !== -1) return 'badge-success';
        if (r.indexOf('RISK-OFF') !== -1 || r.indexOf('RISK OFF') !== -1) return 'badge-danger';
        if (r.indexOf('TRUNG') !== -1 || r.indexOf('NEUTRAL') !== -1) return 'badge-warning';
        return 'badge-muted';
    }

    function passedBadgeClass(passed) {
        return /^0\s/.test((passed || '').trim()) ? 'badge-danger' : 'badge-success';
    }

    /* ---------- Render bảng ---------- */

    function formatDate(iso) {
        var p = iso.split('-'); // yyyy-mm-dd
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    function renderMessageRow(cls, message) {
        var tr = document.createElement('tr');
        var td = document.createElement('td');
        td.colSpan = 5;
        td.className = cls;
        td.textContent = message;
        tr.appendChild(td);
        tbody.appendChild(tr);
    }

    function badge(cls, text) {
        var span = document.createElement('span');
        span.className = 'badge ' + cls;
        span.textContent = text;
        return span;
    }

    function renderRow(file, date) {
        var tr = document.createElement('tr');
        tr.dataset.file = file;
        tr.dataset.date = date;

        var tdDate = document.createElement('td');
        tdDate.className = 'date-cell';
        tdDate.textContent = formatDate(date);
        tr.appendChild(tdDate);

        for (var i = 0; i < 4; i++) {
            var td = document.createElement('td');
            td.className = 'muted';
            td.textContent = '…';
            tr.appendChild(td);
        }

        tr.addEventListener('click', function () { openReport(tr, true); });
        return tr;
    }

    function fillRowMeta(tr, meta) {
        var tds = tr.querySelectorAll('td');
        if (!meta) {
            tds[1].textContent = '—';
            tds[2].textContent = '—';
            tds[3].textContent = '—';
            tds[4].textContent = '—';
            return;
        }
        tds[1].textContent = '';
        tds[1].appendChild(badge(regimeBadgeClass(meta.regime), meta.regime || 'N/A'));
        tds[2].textContent = '';
        tds[2].appendChild(badge(passedBadgeClass(meta.passed), meta.passed || 'N/A'));
        tds[3].textContent = meta.allocation || '—';
        tds[3].className = '';
        tds[4].textContent = meta.breadth || '—';
        tds[4].className = '';
    }

    /* ---------- Viewer ---------- */

    // Báo cáo gốc có khung riêng (nền xám + container trắng đổ bóng).
    // Inject CSS để bỏ khung, nội dung liền mạch với trang index.
    viewerFrame.addEventListener('load', function () {
        try {
            var doc = viewerFrame.contentDocument;
            if (!doc || !doc.head) return;
            var style = doc.createElement('style');
            style.textContent =
                'body{background:transparent !important;padding:20px !important}' +
                '.container{max-width:none !important;background:transparent !important;' +
                'padding:0 !important;border-radius:0 !important;box-shadow:none !important}';
            doc.head.appendChild(style);
        } catch (e) { /* khác origin thì bỏ qua */ }
    });

    function openReport(tr, scrollToViewer) {
        var file = tr.dataset.file;
        var date = tr.dataset.date;

        var rows = tbody.querySelectorAll('tr');
        for (var i = 0; i < rows.length; i++) rows[i].classList.remove('active');
        tr.classList.add('active');

        viewerFrame.src = 'data/' + file;

        if (history.replaceState) history.replaceState(null, '', '#' + date);
        if (scrollToViewer) {
            viewerFrame.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /* ---------- Khởi tạo ---------- */

    fetchFileList()
        .then(function (files) {
            // Mới nhất lên đầu
            files.sort().reverse();

            tbody.textContent = '';
            if (!files.length) {
                renderMessageRow('loading', 'Chưa có báo cáo nào trong data/.');
                return;
            }

            var latestDate = files[0].match(FILE_PATTERN)[1];

            files.forEach(function (file) {
                var date = file.match(FILE_PATTERN)[1];
                var tr = renderRow(file, date);
                tbody.appendChild(tr);
                fetchMeta(file).then(function (meta) { fillRowMeta(tr, meta); });
            });

            // Deep-link: index.html#2026-06-05 → mở báo cáo đó;
            // mặc định luôn hiện báo cáo ngày mới nhất.
            var hash = location.hash.replace('#', '');
            var target = null;
            if (/^\d{4}-\d{2}-\d{2}$/.test(hash)) {
                target = tbody.querySelector('tr[data-date="' + hash + '"]');
            }
            if (!target) target = tbody.querySelector('tr[data-date="' + latestDate + '"]');
            if (target) openReport(target, false);
        })
        .catch(function (err) {
            tbody.textContent = '';
            renderMessageRow('error', 'Không tải được danh sách báo cáo (' +
                String(err && err.message || err) + '). Thử tải lại trang.');
        });
})();
