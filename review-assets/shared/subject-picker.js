(function () {
    window.imccSubjectPicker = function (select, search, courses, form) {
        const row = select.closest('.form-row'), searchRow = search.closest('.form-row');
        row.hidden = true;
        searchRow.querySelector('label').textContent = 'Find a curriculum subject';
        search.placeholder = 'Search by code or subject title…';
        const results = document.createElement('div');
        results.className = 'subject-results'; results.id = 'subjectResults';
        results.setAttribute('aria-label', 'Matching curriculum subjects');
        search.setAttribute('aria-controls', results.id);
        const status = document.createElement('p'); status.className = 'subject-count'; status.setAttribute('role', 'status');
        const selected = document.createElement('div'); selected.className = 'selected-subject'; selected.hidden = true;
        const insights = document.createElement('p'); insights.id = 'subjectInsights'; insights.setAttribute('role', 'status');
        const change = document.createElement('button'); change.type = 'button'; change.textContent = 'Change subject'; change.className = 'btn btn-outline';
        selected.append(insights, change); searchRow.after(status, results, selected);
        const details = document.createElement('details'); details.className = 'subject-details';
        const summary = document.createElement('summary'); summary.textContent = 'Edit subject details'; details.append(summary);
        const fields = document.createElement('div'); fields.className = 'offering-grid'; details.append(fields);
        ['code','title','units','program','year'].forEach(name => { const field = form.querySelector('#field_' + name); if (field) fields.append(field.closest('.form-row')); });
        selected.after(details);
        const heading = document.createElement('h4'); heading.textContent = 'Offering details'; details.after(heading);
        const offering = document.createElement('div'); offering.className = 'offering-grid'; heading.after(offering);
        [...form.children].filter(el => el.classList.contains('form-row') && el !== row && el !== searchRow).forEach(el => offering.append(el));
        const note = document.createElement('p'); note.className = 'subject-count';
        note.textContent = window.IMCC_DEVELOPER_VIEW === true ? 'Read-only preview—changes cannot be saved.' : 'Instructor assignment is optional. Leave it unassigned while staffing is pending.';
        form.append(note);
        function showSelection() {
            const course = courses.find(c => c.code === select.value);
            if (!course) return;
            selected.hidden = false; results.hidden = status.hidden = searchRow.hidden = true;
            details.open = false; change.focus();
        }
        function filter() {
            const query = search.value.trim().toLowerCase();
            const matches = courses.filter(c => (c.code + ' ' + c.title).toLowerCase().includes(query));
            results.replaceChildren(); status.textContent = matches.length + ' subjects found';
            matches.forEach(course => {
                const button = document.createElement('button'); button.type = 'button'; button.className = 'subject-result';
                const code = document.createElement('strong'); code.textContent = course.code;
                const title = document.createElement('span'); title.textContent = course.title;
                const meta = document.createElement('small');
                meta.textContent = [((course.lec_units || 0) + (course.lab_units || 0) || course.units || 3) + ' units', course.program, course.year_level ? 'Year ' + course.year_level : '', course.semester === 3 ? 'Summer' : course.semester === 2 ? '2nd Semester' : course.semester === 1 ? '1st Semester' : ''].filter(Boolean).join(' · ');
                button.append(code, title, meta);
                button.addEventListener('click', () => { select.value = course.code; select.dispatchEvent(new Event('change', {bubbles:true})); });
                results.append(button);
            });
            if (!matches.length) { const empty = document.createElement('p'); empty.textContent = 'No subjects found. Clear or change your search.'; results.append(empty); }
        }
        results.addEventListener('keydown', event => {
            const buttons = [...results.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
            if (event.key === 'Escape') search.focus();
        });
        search.addEventListener('keydown', event => { if(event.key === 'ArrowDown') { event.preventDefault(); results.querySelector('button')?.focus(); } });
        search.addEventListener('input', filter);
        select.addEventListener('change', showSelection);
        change.addEventListener('click', () => { selected.hidden = true; results.hidden = status.hidden = searchRow.hidden = false; search.focus(); });
        filter();
        if (form.querySelector('#field_code')?.value) details.open = true;
        return insights;
    };
})();
