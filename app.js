(() => {
  'use strict';
  const SK = 'contas_keep_v2', TK = 'contas_keep_theme', VK = 'contas_keep_view';
  const PK = 'contas_keep_people', MK = 'contas_keep_cur_month', WK = 'contas_keep_cur_ws';
  
  const load = () => JSON.parse(localStorage.getItem(SK) || '[]');
  const save = d => localStorage.setItem(SK, JSON.stringify(d));
  const loadPeople = () => JSON.parse(localStorage.getItem(PK) || '[]');
  const savePeople = p => localStorage.setItem(PK, JSON.stringify(p));

  let notes = load(), editingId = null, editColor = 'default';
  let people = loadPeople();
  let currentMonth = localStorage.getItem(MK) || new Date().toISOString().slice(0,7);
  let currentWorkspace = localStorage.getItem(WK) || 'personal';

  const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);

  // Confetti effect
  const confetti = () => {
    const colors = ['#7c4dff', '#69f0ae', '#aecbfa', '#ffab40', '#ff5252'];
    for(let i=0; i<50; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 3000);
    }
  };
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const fmt = v => (parseFloat(v)||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const pv = str => { if(!str) return 0; let s=String(str).replace(/[^\d.,\-]/g,''); if(s.includes(',')) s=s.replace(/\./g,'').replace(',','.'); return parseFloat(s)||0; };
  const esc = s => { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; };
  const fmtIn = v => (!v||v===0)?'':v.toFixed(2).replace('.',',');
  const toast = msg => { const t=$('#toast'); t.textContent=msg; t.classList.remove('hidden'); requestAnimationFrame(()=>t.classList.add('show')); setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.classList.add('hidden'),300)},2200); };

  // Theme
  const applyTheme = t => { document.documentElement.setAttribute('data-theme',t); $('#icon-moon').style.display=t==='dark'?'block':'none'; $('#icon-sun').style.display=t==='light'?'block':'none'; localStorage.setItem(TK,t); };
  applyTheme(localStorage.getItem(TK)||'dark');
  $('#btn-theme').onclick = () => applyTheme((document.documentElement.getAttribute('data-theme')||'dark')==='dark'?'light':'dark');

  // Backup Import/Export
  $('#btn-export').onclick = () => {
    const data = { notes, theme: localStorage.getItem(TK), view: localStorage.getItem(VK) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contas_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup exportado com sucesso!');
  };

  $('#btn-import').onclick = () => $('#import-file').click();
  $('#import-file').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.notes && Array.isArray(data.notes)) {
          notes = data.notes;
          save(notes);
          if (data.theme) applyTheme(data.theme);
          if (data.view) applyView(data.view);
          updateMonthOptions();
          if (notes.length > 0) {
            currentMonth = notes[0].month || new Date(notes[0].createdAt).toISOString().slice(0,7);
            localStorage.setItem(MK, currentMonth);
          }
          render();
          toast('Backup importado com sucesso!');
        } else {
          throw new Error('Formato inválido');
        }
      } catch (err) {
        toast('Erro ao importar backup: arquivo inválido');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // View
  const grid = $('#notes-grid');
  const applyView = v => { grid.className=v==='list'?'list-view':'grid-view'; $('#icon-grid').style.display=v==='list'?'block':'none'; $('#icon-list').style.display=v==='grid'?'block':'none'; localStorage.setItem(VK,v); };
  applyView(localStorage.getItem(VK)||'grid');
  $('#btn-view-toggle').onclick = () => applyView((localStorage.getItem(VK)||'grid')==='grid'?'list':'grid');

  // Search
  let sdb; $('#search-input').addEventListener('input', () => { clearTimeout(sdb); sdb=setTimeout(()=>render($('#search-input').value.trim()),200); });

  // Copy to Next Month
  $('#btn-copy-next').onclick = () => {
    const note = notes.find(n => n.id === editingId);
    if (!note) return;
    
    // Parse current month
    let [y, m] = note.month.split('-').map(Number);
    m++; if(m > 12) { m = 1; y++; }
    const nextMonth = `${y}-${m.toString().padStart(2, '0')}`;
    
    const newNote = JSON.parse(JSON.stringify(note));
    newNote.id = uid();
    newNote.month = nextMonth;
    newNote.createdAt = Date.now();
    newNote.title = note.title.replace(/\d{4}/g, y).replace(/Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro/g, (match) => {
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const idx = months.indexOf(match);
        return months[(idx + 1) % 12];
    });

    const filterRules = (it, scName) => {
        const name = it.name.toLowerCase();
        const isFixas = scName.toUpperCase() === 'FIXAS';
        const isRecurrente = it.isSubscription || name.includes('recarga') || name.includes('seguro');
        
        if (it.installment) {
            let [cur, total] = it.installment.split('/').map(Number);
            if (cur < total) {
                it.installment = `${cur + 1}/${total}`;
                it.checked = false;
                return true;
            }
            return false; // Last installment reached
        }
        
        if (isFixas || isRecurrente) {
            it.checked = false;
            return true;
        }
        return false;
    };

    newNote.subcategories.forEach(sc => {
        sc.items = sc.items.filter(it => filterRules(it, sc.name));
    });

    notes.unshift(newNote);
    save(notes);
    updateMonthOptions();
    currentMonth = nextMonth;
    localStorage.setItem(MK, currentMonth);
    overlay.classList.add('hidden');
    render();
    toast(`Cópia criada para ${nextMonth.split('-').reverse().join('/')}`);
  };

  // Workspace Toggle
  $$('.ws-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.ws-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentWorkspace = btn.dataset.ws;
      localStorage.setItem(WK, currentWorkspace);
      render();
    };
  });
  $(`#ws-${currentWorkspace}`).classList.add('active');

  // Month Filter
  const monthSelect = $('#filter-month');
  function updateMonthOptions() {
    const months = new Set();
    const today = new Date().toISOString().slice(0,7);
    months.add(today);
    notes.forEach(n => {
      const m = n.month || (n.createdAt ? new Date(n.createdAt).toISOString().slice(0,7) : null);
      if(m) months.add(m);
    });
    const sorted = [...months].sort().reverse();
    monthSelect.innerHTML = sorted.map(m => `<option value="${m}">${m.split('-').reverse().join('/')}</option>`).join('');
    monthSelect.value = currentMonth;
    if((!monthSelect.value || monthSelect.value === '') && sorted.length > 0) {
      currentMonth = sorted[0];
      monthSelect.value = currentMonth;
    }
    localStorage.setItem(MK, currentMonth);
  }
  monthSelect.onchange = () => {
    currentMonth = monthSelect.value;
    localStorage.setItem(MK, currentMonth);
    render();
  };

  // ─── RENDER CARDS ───
  function render(filter='') {
    grid.innerHTML='';
    const q=filter.toLowerCase();
    
    // Filter by Workspace and Month
    const workspaceFiltered = notes.filter(n => (n.type || 'personal') === currentWorkspace);
    const monthFiltered = workspaceFiltered.filter(n => {
      const m = n.month || (n.createdAt ? new Date(n.createdAt).toISOString().slice(0,7) : '');
      return m === currentMonth;
    });

    const finalFiltered = monthFiltered.filter(n=>{
      if(!q) return true;
      if(n.title.toLowerCase().includes(q)) return true;
      return n.subcategories.some(sc=>sc.name.toLowerCase().includes(q)||sc.items.some(i=>i.name.toLowerCase().includes(q)));
    });

    finalFiltered.forEach(note=>{
      const card=document.createElement('div'); card.className='note-card';
      if(note.color&&note.color!=='default') card.style.background=`var(--color-${note.color})`;
      let totalAll=0,pendingMine=0,warningTotal=0,pendingCount=0;
      note.subcategories.forEach(sc=>sc.items.forEach(it=>{
        totalAll+=it.value;
        if(it.isWarning) warningTotal+=it.value;
        else if(!it.checked){pendingMine+=it.value;pendingCount++;}
      }));
      let html=`<div class="note-title">${esc(note.title)}</div>`;
      const MAX_SUBCATS=6;
      note.subcategories.slice(0,MAX_SUBCATS).forEach(sc=>{
        const scTotal = sc.items.reduce((s,i)=>s+i.value,0);
        const scMine = sc.items.filter(i=>!i.isWarning).reduce((s,i)=>s+i.value,0);
        const hasWarning = sc.items.some(i=>i.isWarning);
        
        let totalsHtml = `<span class="subcat-total-mine">${fmt(scTotal)}</span>`;
        if(hasWarning) {
          totalsHtml = `<span class="subcat-total-mine" title="Meu Gasto">${fmt(scMine)}</span><span class="subcat-total-full" title="Total Cartão">${fmt(scTotal)}</span>`;
        }

        html+=`<div class="card-subcat"><div class="card-subcat-header"><span>${esc(sc.name)}</span><div class="subcat-totals">${totalsHtml}</div></div>`;
        const MAX_ITEMS=3;
        sc.items.slice(0,MAX_ITEMS).forEach(it=>{
          const cls=['card-subcat-item']; if(it.checked) cls.push('checked'); if(it.isWarning) cls.push('is-warning');
          const itemDue = ((sc.name || '').toUpperCase() === 'FIXAS' ? it.dueDay : sc.dueDay);
          html+=`<div class="${cls.join(' ')}"><span class="item-dot"></span><span>${itemDue ? `<span class="item-card-date">${itemDue.padStart(2,'0')}/</span>` : ''}${it.isSubscription?'🔄 ':''}${it.isWarning?'⚠️ ':''}${esc(it.name)}</span><span class="item-val">${fmt(it.value)}</span></div>`;
        });
        if(sc.items.length>MAX_ITEMS) html+=`<div class="card-more">+ ${sc.items.length-MAX_ITEMS} itens</div>`;
        html+=`</div>`;
      });
      if(note.subcategories.length>MAX_SUBCATS) html+=`<div class="card-more">+ ${note.subcategories.length-MAX_SUBCATS} subcategorias</div>`;
      const budgetTotal=totalAll-warningTotal;
      const badgeCls=pendingCount>0?'has-pending':'all-paid';
      const badgeTxt=pendingCount>0?`${pendingCount} pendente${pendingCount>1?'s':''}`:'✓ Tudo pago';
      html+=`<div class="note-footer"><span class="total-badge">${fmt(budgetTotal)}</span>`;
      if(warningTotal>0) html+=`<span class="warning-badge">⚠️ ${fmt(warningTotal)}</span>`;
      html+=`<span class="pending-badge ${badgeCls}">${badgeTxt}</span></div>`;
      card.innerHTML=html;
      card.onclick=()=>openModal(note.id);
      grid.appendChild(card);
    });
    updateDashboard();
  }

  function updateDashboard() {
    let total=0,budget=0,pending=0,paid=0,tp=0,inc=0;
    const filtered = notes.filter(n => 
      (n.type || 'personal') === currentWorkspace && 
      (n.month || (n.createdAt ? new Date(n.createdAt).toISOString().slice(0,7) : '')) === currentMonth
    );
    filtered.forEach(n=>{
      n.subcategories.forEach(sc=>sc.items.forEach(i=>{
        total+=i.value;
        if(i.isWarning){tp+=i.value}
        else{budget+=i.value;if(i.checked)paid+=i.value;else pending+=i.value;}
      }));
      if(n.income){inc+=(n.income.salary||0)+(n.income.youtube||0)+(n.income.hdc||0)+(n.income.extra||0);}
    });

    $('#stat-total').textContent=fmt(total);
    $('#stat-budget').textContent=fmt(budget);
    $('#stat-pending').textContent=fmt(pending);
    $('#stat-paid').textContent=fmt(paid);
    $('#stat-thirdparty').textContent=fmt(tp);
    $('#stat-income').textContent=fmt(inc);
  }

  // ─── THIRD PARTY MODAL ───
  const tpOverlay=$('#third-party-overlay');
  const tpContent=$('#tp-content');
  
  $('.stat-card.third-party').onclick = () => {
    tpContent.innerHTML = '';
    const people = {};
    notes.filter(n => (n.month || new Date(n.createdAt).toISOString().slice(0,7)) === currentMonth)
         .forEach(n => n.subcategories.forEach(sc => sc.items.forEach(it => {
      if(it.isWarning) {
        const p = it.person || 'Outros';
        if(!people[p]) people[p] = { total: 0, groups: {} };
        people[p].total += it.value;
        if(!people[p].groups[sc.name]) people[p].groups[sc.name] = { total: 0, dueDay: sc.dueDay, items: [] };
        people[p].groups[sc.name].total += it.value;
        people[p].groups[sc.name].items.push({ ...it, noteId: n.id, subcatId: sc.id });
      }
    })));

    const sortedPeople = Object.keys(people).sort();
    if(sortedPeople.length === 0) {
      tpContent.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Nenhum gasto de terceiro encontrado</div>';
    } else {
      sortedPeople.forEach(p => {
        const group = people[p];
        const groupEl = document.createElement('div'); groupEl.className = 'person-group';
        let groupsHtml = '';
        for(const [scName, scGroup] of Object.entries(group.groups)) {
            groupsHtml += `
              <div class="tp-subcat-group">
                <div class="tp-subcat-header">
                  <span>${esc(scName)} ${scGroup.dueDay ? `<span class="tp-header-due">📅 ${scGroup.dueDay}</span>` : ''}</span>
                  <span>${fmt(scGroup.total)}</span>
                </div>
                ${scGroup.items.map(it => `
                  <div class="person-item-row">
                    <div class="person-item-name">
                      <span style="text-decoration: ${it.checked ? 'line-through' : 'none'}; opacity: ${it.checked ? 0.4 : 1}">
                        ${(it.dueDay || scGroup.dueDay) ? `<span class="person-item-date">${(it.dueDay || scGroup.dueDay).padStart(2,'0')}</span>` : ''}${esc(it.name)}
                      </span>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px">
                      <span class="person-item-value">${fmt(it.value)}</span>
                      <input type="checkbox" class="tp-item-check" data-note-id="${it.noteId}" data-sc-id="${it.subcatId}" data-item-id="${it.id}" ${it.checked ? 'checked' : ''}>
                    </div>
                  </div>
                `).join('')}
              </div>`;
        }
        groupEl.innerHTML = `<div class="person-header"><span class="person-name">👤 ${esc(p)}</span><span class="person-total">${fmt(group.total)}</span></div><div class="person-items">${groupsHtml}</div>`;
        tpContent.appendChild(groupEl);
      });
      // (Keep checkbox handlers as they are...)

      // Add click handlers for checkboxes in the summary
      tpContent.querySelectorAll('.tp-item-check').forEach(chk => {
        chk.onchange = () => {
          const { noteId, scId, itemId } = chk.dataset;
          const note = notes.find(n => n.id === noteId);
          if (note) {
            const sc = note.subcategories.find(s => s.id === scId);
            if (sc) {
              const it = sc.items.find(i => i.id === itemId);
              if (it) {
                it.checked = chk.checked;
                save(notes);
                render(); // Update main view
                // Refresh summary modal to show strikethrough
                $('.stat-card.third-party').onclick(); 
              }
            }
          }
        };
      });
    }
    tpOverlay.classList.remove('hidden');
  };

  $('#btn-tp-modal-close').onclick = () => tpOverlay.classList.add('hidden');
  $('#btn-tp-close').onclick = () => tpOverlay.classList.add('hidden');
  tpOverlay.onclick = e => { if(e.target === tpOverlay) tpOverlay.classList.add('hidden'); };

  // ─── PEOPLE MODAL ───
  const peopleOverlay = $('#people-overlay');
  const peopleListEl = $('#people-list');
  const peopleDatalist = $('#people-datalist');

  $('#btn-manage-people').onclick = () => {
    renderPeopleList();
    peopleOverlay.classList.remove('hidden');
  };

  $('#btn-people-close').onclick = () => peopleOverlay.classList.add('hidden');

  function renderPeopleList() {
    peopleListEl.innerHTML = people.map(p => `
      <div class="person-row">
        <span>👤 ${esc(p)}</span>
        <button class="btn-remove-person" data-name="${esc(p)}">×</button>
      </div>
    `).join('');
    
    peopleDatalist.innerHTML = people.map(p => `<option value="${esc(p)}">`).join('');

    $$('.btn-remove-person').forEach(btn => {
      btn.onclick = () => {
        people = people.filter(p => p !== btn.dataset.name);
        savePeople(people);
        renderPeopleList();
      };
    });
  }

  $('#btn-add-person').onclick = () => {
    const name = $('#new-person-name').value.trim();
    if(name && !people.includes(name)) {
      people.push(name);
      savePeople(people);
      $('#new-person-name').value = '';
      renderPeopleList();
    }
  };

  // ─── FAB: new note ───
  $('#fab-new').onclick = () => {
    const note={
      id:uid(),title:'',color:'default',createdAt:Date.now(),
      month: currentMonth, type: currentWorkspace,
      income:{salary:0,youtube:0,hdc:0,extra:0,extraLabel:''},
      subcategories:[]
    };
    notes.unshift(note); save(notes);
    updateMonthOptions();
    openModal(note.id);
  };

  // ─── MODAL ───
  const overlay=$('#modal-overlay');
  function openModal(id) {
    const note=notes.find(n=>n.id===id); if(!note) return;
    editingId=id; editColor=note.color||'default';
    $('#edit-title').value=note.title;
    $('#edit-month').value=note.month || new Date(note.createdAt).toISOString().slice(0,7);
    $('#edit-type').value=note.type || 'personal';
    
    // Income
    const inc=note.income||{salary:0,youtube:0,hdc:0,extra:0,extraLabel:''};
    $('#income-salary').value=fmtIn(inc.salary);
    $('#income-youtube').value=fmtIn(inc.youtube);
    $('#income-hdc').value=fmtIn(inc.hdc);
    $('#income-extra').value=fmtIn(inc.extra);
    $('#income-extra-label').value=inc.extraLabel||'';
    updateIncomeTotal();
    // Subcategories
    renderSubcategories(note);
    // Color
    $$('#edit-color-picker .color-dot').forEach(d=>d.classList.toggle('active',d.dataset.color===editColor));
    overlay.classList.remove('hidden');
    if(!note.title) $('#edit-title').focus();
    updateModalSummary();
  }

  function renderSubcategories(note) {
    const container=$('#subcategories-container'); container.innerHTML='';
    note.subcategories.forEach((sc,si)=>{
      container.appendChild(buildSubcatBlock(sc,si));
    });
  }

  function buildSubcatBlock(sc) {
    const block=document.createElement('div'); block.className='subcategory-block'; block.dataset.scId=sc.id;
    const scTotal = sc.items.reduce((s,i)=>s+i.value,0);
    const scMine = sc.items.filter(i=>!i.isWarning).reduce((s,i)=>s+i.value,0);
    const hasWarning = sc.items.some(i=>i.isWarning);

    let totalsHtml = `<span class="subcat-header-mine">${fmt(scTotal)}</span>`;
    if(hasWarning) {
      totalsHtml = `<span class="subcat-header-mine" title="Meu Gasto">${fmt(scMine)}</span><span class="subcat-header-full" title="Total Cartão">${fmt(scTotal)}</span>`;
    }

    const isFixas = (sc.name || '').toUpperCase() === 'FIXAS';
    // Header
    const header=document.createElement('div'); header.className='subcat-header';
    header.innerHTML=`<span class="subcat-icon">💳</span><input type="text" class="subcat-header-name" value="${esc(sc.name)}" placeholder="NOME DA SUBCATEGORIA">
    ${!isFixas ? `<div class="item-due-container subcat-due" title="Dia do Vencimento da Subcategoria">📅<input type="text" class="subcat-due-day" value="${esc(sc.dueDay||'')}" placeholder="Dia"></div>` : ''}
    <div class="subcat-header-totals">${totalsHtml}</div><button class="icon-btn subcat-delete" title="Remover subcategoria"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
    block.appendChild(header);
    // Body
    const body=document.createElement('div'); body.className='subcat-body';
    // Items
    sc.items.forEach(item=>body.appendChild(buildItemRow(item, sc.name)));
    // Add item row
    const addRow=document.createElement('div'); addRow.className='add-item-row';
    addRow.innerHTML=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><input type="text" placeholder="Adicionar conta..." autocomplete="off">`;
    addRow.querySelector('input').addEventListener('keydown', e => {
      if(e.key==='Enter'&&e.target.value.trim()){
        e.preventDefault();
        const item={id:uid(),name:e.target.value.trim(),value:0,checked:false,isWarning:false,installment:''};
        body.insertBefore(buildItemRow(item),addRow);
        e.target.value=''; autoSave();
      }
    });
    body.appendChild(addRow);
    block.appendChild(body);
    // Toggle collapse
    const toggleCollapse = e => {
      if(e.target.closest('.subcat-delete') || e.target.closest('.subcat-header-name') || e.target.closest('.subcat-due')) return;
      header.classList.toggle('collapsed');
      body.classList.toggle('hidden');
    };
    header.addEventListener('click', toggleCollapse);
    // Delete subcategory
    header.querySelector('.subcat-delete').addEventListener('click', e => {
      e.stopPropagation();
      block.remove(); autoSave();
    });
    // Name change
    header.querySelector('.subcat-header-name').addEventListener('input', ()=>autoSave());
    header.querySelector('.subcat-header-name').addEventListener('click', e=>e.stopPropagation());
    return block;
  }

  function buildItemRow(item, parentName='') {
    const isFixas = (parentName || '').toUpperCase() === 'FIXAS';
    const row=document.createElement('div'); row.className='edit-item'+(item.isWarning?' is-warning':'')+(item.checked?' checked':''); row.dataset.itemId=item.id;
    row.draggable = true;
    row.innerHTML=`<span class="item-drag-handle" title="Mover">⠿</span><input type="checkbox" class="item-check" ${item.checked?'checked':''}><input type="text" class="item-name" value="${esc(item.name)}" placeholder="Nome da conta"><input type="text" class="item-person-input" value="${esc(item.person||'')}" list="people-datalist" placeholder="Pessoa">
    ${isFixas ? `<div class="item-due-container" title="Dia do Vencimento">📅<input type="text" class="item-due-day" value="${esc(item.dueDay||'')}" placeholder="Dia"></div>` : ''}
    <input type="text" class="item-installment" value="${esc(item.installment||'')}" placeholder="x/x"><input type="text" class="item-value-input" value="${fmtIn(item.value)}" placeholder="0,00"><button class="btn-sub-toggle ${item.isSubscription?'active':''}" title="Assinatura/Recorrente">🔄</button><button class="btn-warning-toggle ${item.isWarning?'active':''}" title="Marcar como terceiro (não entra no seu orçamento)">⚠️</button><button class="item-delete" title="Remover"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    
    // Drag and drop events
    row.addEventListener('dragstart', e => {
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      autoSave(); 
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      const dragging = $('.dragging');
      if (!dragging || dragging === row) return;
      const container = row.parentNode;
      const children = [...container.querySelectorAll('.edit-item')];
      const curIdx = children.indexOf(dragging);
      const targetIdx = children.indexOf(row);
      if (curIdx < targetIdx) container.insertBefore(dragging, row.nextSibling);
      else container.insertBefore(dragging, row);
    });
    
    row.querySelector('.item-check').onchange=()=>{
        const chk = row.querySelector('.item-check').checked;
        if (chk) {
            row.classList.add('checked');
            const inst = row.querySelector('.item-installment').value.trim();
            if (inst) {
                let [c, t] = inst.split('/').map(Number);
                if (c > 0 && c === t) confetti();
            }
        } else {
            row.classList.remove('checked');
        }
        autoSave();
    };
    row.querySelector('.item-name').oninput=()=>autoSave();
    row.querySelector('.item-person-input').oninput=()=>autoSave();
    const dueDayInput = row.querySelector('.item-due-day');
    if (dueDayInput) dueDayInput.oninput=()=>autoSave();
    row.querySelector('.item-installment').oninput=()=>autoSave();
    row.querySelector('.item-value-input').oninput=()=>autoSave();
    row.querySelector('.btn-sub-toggle').onclick=()=>{
      const btn=row.querySelector('.btn-sub-toggle');
      btn.classList.toggle('active');
      autoSave();
    };
    row.querySelector('.btn-warning-toggle').onclick=()=>{
      const btn=row.querySelector('.btn-warning-toggle');
      btn.classList.toggle('active');
      row.classList.toggle('is-warning');
      autoSave();
    };
    row.querySelector('.item-delete').onclick=()=>{row.remove();autoSave();};
    return row;
  }

  // Add subcategory
  $('#btn-add-subcategory').onclick = () => {
    const sc={id:uid(),name:'',items:[]};
    const block=buildSubcatBlock(sc);
    $('#subcategories-container').appendChild(block);
    block.querySelector('.subcat-header-name').focus();
  };

  // Income inputs
  ['income-salary','income-youtube','income-hdc','income-extra'].forEach(id=>{
    $(`#${id}`).addEventListener('input',()=>{updateIncomeTotal();autoSave();});
  });
  $('#income-extra-label').addEventListener('input',()=>autoSave());

  function updateIncomeTotal() {
    const total=pv($('#income-salary').value)+pv($('#income-youtube').value)+pv($('#income-hdc').value)+pv($('#income-extra').value);
    $('#income-total').textContent=fmt(total);
  }

  // Income toggle
  const incomeToggle=$('#income-toggle'), incomeFields=$('#income-fields');
  incomeToggle.onclick=()=>{incomeToggle.classList.toggle('collapsed');incomeFields.classList.toggle('hidden');};

  // Color picker
  $$('#edit-color-picker .color-dot').forEach(dot=>{
    dot.onclick=()=>{
      $$('#edit-color-picker .color-dot').forEach(d=>d.classList.remove('active'));
      dot.classList.add('active'); editColor=dot.dataset.color; autoSave();
    };
  });

  // Auto save from modal
  let saveTimer;
  function autoSave() {
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>commitSave(),150);
  }

  function commitSave() {
    const note=notes.find(n=>n.id===editingId); if(!note) return;
    note.title=$('#edit-title').value.trim()||'Sem título';
    note.month=$('#edit-month').value;
    note.type=$('#edit-type').value;
    note.color=editColor;
    note.income={
      salary:pv($('#income-salary').value),youtube:pv($('#income-youtube').value),
      hdc:pv($('#income-hdc').value),extra:pv($('#income-extra').value),
      extraLabel:$('#income-extra-label').value.trim()
    };
    note.subcategories=[];
    $$('#subcategories-container .subcategory-block').forEach(block=>{
      const scName = block.querySelector('.subcat-header-name').value.trim();
      const scDueInput = block.querySelector('.subcat-due-day');
      const sc={
        id:block.dataset.scId||uid(), 
        name:scName, 
        dueDay: scDueInput ? scDueInput.value.trim() : '',
        items:[]
      };
      block.querySelectorAll('.edit-item').forEach(row=>{
        const name=row.querySelector('.item-name').value.trim();
        if(!name) return;
        sc.items.push({
          id:row.dataset.itemId||uid(), name,
          value:pv(row.querySelector('.item-value-input').value),
          checked:row.querySelector('.item-check').checked,
          isWarning:row.querySelector('.btn-warning-toggle').classList.contains('active'),
          isSubscription:row.querySelector('.btn-sub-toggle').classList.contains('active'),
          installment:row.querySelector('.item-installment').value.trim(),
          person:row.querySelector('.item-person-input').value.trim(),
          dueDay:row.querySelector('.item-due-day') ? row.querySelector('.item-due-day').value.trim() : ''
        });
      });
      note.subcategories.push(sc);
    });
    // Update subcat totals in header
    $$('#subcategories-container .subcategory-block').forEach(block=>{
      const items=note.subcategories.find(sc=>sc.id===block.dataset.scId)?.items || [];
      const t=items.reduce((s,i)=>s+i.value,0);
      const m=items.filter(i=>!i.isWarning).reduce((s,i)=>s+i.value,0);
      const hasW=items.some(i=>i.isWarning);
      
      const totalsEl = block.querySelector('.subcat-header-totals');
      if(hasW) totalsEl.innerHTML = `<span class="subcat-header-mine" title="Meu Gasto">${fmt(m)}</span><span class="subcat-header-full" title="Total Cartão">${fmt(t)}</span>`;
      else totalsEl.innerHTML = `<span class="subcat-header-mine">${fmt(t)}</span>`;
    });
    save(notes); 
    // If month was changed in modal, update the global filter to that month
    if (note.month !== currentMonth) {
        currentMonth = note.month;
        localStorage.setItem(MK, currentMonth);
    }
    render($('#search-input').value.trim());
    updateModalSummary();
    updateMonthOptions(); 
  }

  function updateModalSummary() {
    const note=notes.find(n=>n.id===editingId); if(!note) return;
    let total=0,budget=0,pending=0,paid=0,tp=0;
    note.subcategories.forEach(sc=>sc.items.forEach(i=>{
      total+=i.value;
      if(i.isWarning)tp+=i.value;
      else{budget+=i.value;if(i.checked)paid+=i.value;else pending+=i.value;}
    }));
    const inc=(note.income?.salary||0)+(note.income?.youtube||0)+(note.income?.hdc||0)+(note.income?.extra||0);
    const balance=inc-budget;
    $('#modal-total').textContent=fmt(total);
    $('#modal-budget').textContent=fmt(budget);
    $('#modal-thirdparty').textContent=fmt(tp);
    $('#modal-pending').textContent=fmt(pending);
    $('#modal-paid').textContent=fmt(paid);
    $('#modal-balance').textContent=fmt(balance);
    const balRow=$('#balance-row');
    balRow.classList.remove('positive','negative');
    balRow.classList.add(balance>=0?'positive':'negative');
  }

  // Title auto save
  $('#edit-title').addEventListener('input',()=>autoSave());

  // Close modal
  const closeModal=()=>{commitSave();overlay.classList.add('hidden');editingId=null;};
  $('#btn-modal-close').onclick=closeModal;
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.classList.contains('hidden'))closeModal();});

  // Delete note
  $('#btn-edit-delete').onclick=()=>{
    if(!editingId) return;
    notes=notes.filter(n=>n.id!==editingId); save(notes);
    overlay.classList.add('hidden'); editingId=null;
    render($('#search-input').value.trim()); toast('Lista excluída');
  };

  // Init
  updateMonthOptions();
  renderPeopleList();
  render();
})();
