const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let myChart, lastExp = [], lastInc = [];
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

// --- GLOBAL WINDOW FUNCTIONS ---

window.handleAuth = async (type) => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const { error } = (type === 'login') 
        ? await supabaseClient.auth.signInWithPassword({ email, password })
        : await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message);
};

window.logout = async () => { await supabaseClient.auth.signOut(); };

window.addIncome = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const source = document.getElementById('inc-source').value;
    const amount = document.getElementById('inc-amount').value;
    if(!source || !amount) return;
    await supabaseClient.from('income').insert([{ user_id: user.id, source, amount: parseFloat(amount), date: new Date().toISOString().split('T')[0] }]);
    window.fetchData();
};

window.addExpense = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const desc = document.getElementById('exp-desc').value;
    const amt = document.getElementById('exp-amount').value;
    const cat = document.getElementById('exp-cat').value;
    const file = document.getElementById('exp-bill').files[0];
    let billUrl = null;

    if (file) {
        const path = `${user.id}/${Date.now()}.jpg`;
        const { error: upErr } = await supabaseClient.storage.from('bills').upload(path, file);
        if (!upErr) {
            const { data: pUrl } = supabaseClient.storage.from('bills').getPublicUrl(path);
            billUrl = pUrl.publicUrl;
        }
    }

    await supabaseClient.from('expenses').insert([{ user_id: user.id, description: desc, amount: parseFloat(amt), category: cat, bill_url: billUrl, date: new Date().toISOString().split('T')[0] }]);
    window.fetchData();
};

window.deleteItem = async (table, id) => {
    if(confirm(`Delete this entry?`)) {
        await supabaseClient.from(table).delete().eq('id', id);
        window.fetchData();
    }
};

window.fetchData = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const [y, m] = document.getElementById('month-picker').value.split('-');
    const start = `${y}-${m}-01`, end = `${y}-${m}-31`;

    const [exp, inc] = await Promise.all([
        supabaseClient.from('expenses').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
        supabaseClient.from('income').select('*').eq('user_id', user.id).gte('date', start).lte('date', end)
    ]);

    lastExp = exp.data || [];
    lastInc = inc.data || [];
    window.renderUIFromCache();
};

window.renderUIFromCache = () => {
    const search = document.getElementById('search-bar').value.toLowerCase();
    
    const filteredExp = lastExp.filter(e => e.description.toLowerCase().includes(search));
    const filteredInc = lastInc.filter(i => i.source.toLowerCase().includes(search));

    const tExp = lastExp.reduce((s, e) => s + Number(e.amount), 0);
    const tInc = lastInc.reduce((s, i) => s + Number(i.amount), 0);
    document.getElementById('net-balance').innerText = rupee.format(tInc - tExp);

    document.getElementById('income-list').innerHTML = '<h4>Income</h4>' + filteredInc.map(i => `
        <div class="list-item">
            <span>${i.source}</span>
            <span><b style="color:#10b981">+${rupee.format(i.amount)}</b> 
            <button onclick="window.deleteItem('income', '${i.id}')" class="del-btn">✕</button></span>
        </div>
    `).join('');

    document.getElementById('expense-list').innerHTML = '<h4>Expenses</h4>' + filteredExp.map(e => `
        <div class="list-item">
            <span>${e.description} ${e.bill_url ? `<a href="${e.bill_url}" target="_blank">📄</a>` : ''}</span>
            <span><b>-${rupee.format(e.amount)}</b> 
            <button onclick="window.deleteItem('expenses', '${e.id}')" class="del-btn">✕</button></span>
        </div>
    `).join('');

    const cats = {}; lastExp.forEach(e => cats[e.category] = (cats[e.category] || 0) + Number(e.amount));
    updateChart(cats);
};

function updateChart(data) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: Object.keys(data), datasets: [{ data: Object.values(data), backgroundColor: ['#6366f1', '#10b981', '#fbbf24', '#f43f5e'] }] },
        options: { plugins: { legend: { position: 'bottom' } } }
    });
}

window.downloadPDF = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text("Financial Statement", 14, 20);
    doc.autoTable({ head: [['Date', 'Desc', 'Amount']], body: lastExp.map(e => [e.date, e.description, e.amount]) });
    doc.save("Report.pdf");
};

supabaseClient.auth.onAuthStateChange((event, session) => {
    document.getElementById('auth-container').style.display = session ? 'none' : 'block';
    document.getElementById('app-container').style.display = session ? 'block' : 'none';
    if (session) {
        document.getElementById('month-picker').value = new Date().toISOString().slice(0, 7);
        window.fetchData();
    }
});
