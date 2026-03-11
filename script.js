const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let myChart;
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

// --- AUTH ---
async function handleAuth(type) {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = (type === 'login') 
        ? await supabaseClient.auth.signInWithPassword({ email, password })
        : await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message);
}
async function logout() { await supabaseClient.auth.signOut(); }

// --- IMAGE COMPRESSION ---
async function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = 800 / img.width;
                canvas.width = 800;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.6);
            };
        };
    });
}

// --- DATA ACTIONS ---
async function addIncome() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const source = document.getElementById('inc-source').value;
    const amount = document.getElementById('inc-amount').value;
    await supabaseClient.from('income').insert([{ user_id: user.id, source, amount: parseFloat(amount), date: new Date().toISOString().split('T')[0] }]);
    fetchData();
}

async function addExpense() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const desc = document.getElementById('exp-desc').value;
    const amt = document.getElementById('exp-amount').value;
    const cat = document.getElementById('exp-cat').value;
    const fileInput = document.getElementById('exp-bill');
    let billUrl = null;

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const blob = await compressImage(file);
        const path = `${user.id}/${Date.now()}.jpg`;
        const { data, error } = await supabaseClient.storage.from('bills').upload(path, blob);
        if (!error) {
            const { data: pUrl } = supabaseClient.storage.from('bills').getPublicUrl(path);
            billUrl = pUrl.publicUrl;
        }
    }

    await supabaseClient.from('expenses').insert([{ user_id: user.id, description: desc, amount: parseFloat(amt), category: cat, bill_url: billUrl, date: new Date().toISOString().split('T')[0] }]);
    fetchData();
}

async function saveBudget() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const cat = document.getElementById('budget-cat-set').value;
    const amt = document.getElementById('budget-amt-set').value;
    await supabaseClient.from('budgets').upsert({ user_id: user.id, category: cat, amount: parseFloat(amt) }, { onConflict: 'user_id, category' });
    fetchData();
}

async function deleteExp(id) {
    if(confirm("Delete this?")) {
        await supabaseClient.from('expenses').delete().eq('id', id);
        fetchData();
    }
}

// --- RENDERING ---
async function fetchData() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const [y, m] = document.getElementById('month-picker').value.split('-');
    const start = `${y}-${m}-01`, end = `${y}-${m}-31`;

    const [exp, inc, bud] = await Promise.all([
        supabaseClient.from('expenses').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
        supabaseClient.from('income').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
        supabaseClient.from('budgets').select('*').eq('user_id', user.id)
    ]);

    renderUI(exp.data || [], inc.data || [], bud.data || []);
}

function renderUI(exp, inc, bud) {
    const tExp = exp.reduce((s, e) => s + Number(e.amount), 0);
    const tInc = inc.reduce((s, i) => s + Number(i.amount), 0);
    document.getElementById('net-balance').innerText = rupee.format(tInc - tExp);

    const list = document.getElementById('expense-list');
    list.innerHTML = exp.map(e => `
        <div style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <span>${e.description} ${e.bill_url ? `<a href="${e.bill_url}" target="_blank" style="color:#a855f7; font-size:10px;">[Bill]</a>` : ''}</span>
            <span>${rupee.format(e.amount)} <button onclick="deleteExp('${e.id}')" style="color:#f43f5e; border:none; background:none; cursor:pointer;">✕</button></span>
        </div>
    `).join('') || '<p style="text-align:center; opacity:0.5;">No data</p>';

    const cats = {}; exp.forEach(e => cats[e.category] = (cats[e.category] || 0) + Number(e.amount));
    const budDiv = document.getElementById('budget-status');
    budDiv.innerHTML = '<h3>Budgets</h3>' + bud.map(b => {
        const spent = cats[b.category] || 0;
        const per = Math.min((spent / b.amount) * 100, 100);
        if(per >= 90) alert(`Warning: ${b.category} budget at ${per.toFixed(0)}%`);
        return `<div style="margin-bottom:10px;"><small>${b.category} (${per.toFixed(0)}%)</small>
            <div style="width:100%; background:rgba(255,255,255,0.1); height:6px; border-radius:3px;">
                <div style="width:${per}%; background:${per > 90 ? '#f43f5e' : '#10b981'}; height:100%; border-radius:3px;"></div>
            </div></div>`;
    }).join('');

    updateChart(cats);
}

function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#6366f1', '#10b981', '#fbbf24', '#f43f5e'] }] }
    });
}

async function downloadPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const { data: { user } } = await supabaseClient.auth.getUser();
    const exp = await supabaseClient.from('expenses').select('*').eq('user_id', user.id);
    doc.text("Monthly Report", 14, 20);
    doc.autoTable({ head: [['Date', 'Desc', 'Amount']], body: exp.data.map(e => [e.date, e.description, e.amount]) });
    doc.save("Report.pdf");
}

supabaseClient.auth.onAuthStateChange((event, session) => {
    document.getElementById('auth-container').style.display = session ? 'none' : 'block';
    document.getElementById('app-container').style.display = session ? 'block' : 'none';
    if (session) {
        document.getElementById('month-picker').value = new Date().toISOString().slice(0, 7);
        fetchData();
    }
});
