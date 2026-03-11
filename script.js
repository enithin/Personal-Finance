const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let myChart;
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

// --- 1. ATTACH FUNCTIONS TO WINDOW (Fixes ReferenceErrors) ---

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
    if(!source || !amount) return alert("Please fill all fields");
    
    await supabaseClient.from('income').insert([{ 
        user_id: user.id, source, amount: parseFloat(amount), 
        date: new Date().toISOString().split('T')[0] 
    }]);
    window.fetchData();
};

window.addExpense = async () => {
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
        const { error } = await supabaseClient.storage.from('bills').upload(path, blob);
        if (!error) {
            const { data: pUrl } = supabaseClient.storage.from('bills').getPublicUrl(path);
            billUrl = pUrl.publicUrl;
        }
    }

    await supabaseClient.from('expenses').insert([{ 
        user_id: user.id, description: desc, amount: parseFloat(amt), 
        category: cat, bill_url: billUrl, date: new Date().toISOString().split('T')[0] 
    }]);
    window.fetchData();
};

window.saveBudget = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    const cat = document.getElementById('budget-cat-set').value;
    const amt = document.getElementById('budget-amt-set').value;
    await supabaseClient.from('budgets').upsert({ 
        user_id: user.id, category: cat, amount: parseFloat(amt) 
    }, { onConflict: 'user_id, category' });
    window.fetchData();
};

window.downloadPDF = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    const [exp, inc] = await Promise.all([
        supabaseClient.from('expenses').select('*').eq('user_id', user.id),
        supabaseClient.from('income').select('*').eq('user_id', user.id)
    ]);

    doc.setFontSize(18);
    doc.text("FinSwift AI Financial Report", 14, 20);
    
    doc.autoTable({
        startY: 30,
        head: [['Date', 'Description', 'Amount']],
        body: exp.data.map(e => [e.date, e.description, rupee.format(e.amount)]),
    });

    doc.save(`FinSwift_Report_${new Date().toLocaleDateString()}.pdf`);
};

window.deleteExp = async (id) => {
    if(confirm("Delete this transaction?")) {
        await supabaseClient.from('expenses').delete().eq('id', id);
        window.fetchData();
    }
};

window.fetchData = async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    const picker = document.getElementById('month-picker');
    const [y, m] = picker.value.split('-');
    const start = `${y}-${m}-01`, end = `${y}-${m}-31`;

    const [exp, inc, bud] = await Promise.all([
        supabaseClient.from('expenses').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
        supabaseClient.from('income').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
        supabaseClient.from('budgets').select('*').eq('user_id', user.id)
    ]);

    renderUI(exp.data || [], inc.data || [], bud.data || []);
};

// --- 2. INTERNAL HELPERS ---

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
    `).join('') || '<p style="text-align:center; opacity:0.5;">No entries</p>';

    const cats = {}; exp.forEach(e => cats[e.category] = (cats[e.category] || 0) + Number(e.amount));
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

// --- 3. AUTO-INIT ---

supabaseClient.auth.onAuthStateChange((event, session) => {
    document.getElementById('auth-container').style.display = session ? 'none' : 'block';
    document.getElementById('app-container').style.display = session ? 'block' : 'none';
    if (session) {
        document.getElementById('month-picker').value = new Date().toISOString().slice(0, 7);
        window.fetchData();
    }
});
