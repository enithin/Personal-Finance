// --- 1. CONFIGURATION ---
const SUPABASE_URL = 'https://vxzmurshrtcnupxltrdj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4em11cnNocnRjbnVweGx0cmRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTQ5OTEsImV4cCI6MjA4ODczMDk5MX0.KBsJd3Sv75onHEI7plRgdwk1eQnOK7tb7rwtgB9Vu30';

let supabaseClient;
let myChart = null;
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

// --- 2. INITIALIZATION ---
window.onload = () => {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            document.getElementById('auth-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'block';
            fetchExpenses();
        } else {
            document.getElementById('auth-container').style.display = 'block';
            document.getElementById('app-container').style.display = 'none';
        }
    });
};

// --- 3. AUTHENTICATION ---
document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
});

document.getElementById('signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (error) alert(error.message);
    else alert("Signup successful! Check your email.");
});

document.getElementById('logout-btn').addEventListener('click', () => supabaseClient.auth.signOut());

// --- 4. CORE LOGIC: FETCH & UI ---
async function fetchExpenses() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    
    // Fetch Expenses and Budgets in parallel
    const [expRes, budRes] = await Promise.all([
        supabaseClient.from('expenses').select('*').eq('user_id', user.id).order('date', { ascending: false }),
        supabaseClient.from('budgets').select('*').eq('user_id', user.id)
    ]);

    const expenses = expRes.data || [];
    const budgets = budRes.data || [];
    updateUI(expenses, budgets);
}

function updateUI(expenses, budgets) {
    const list = document.getElementById('expense-list');
    const budgetStatus = document.getElementById('budget-status');
    list.innerHTML = '';
    budgetStatus.innerHTML = '<h3>Budget Progress</h3>';
    
    let total = 0;
    let catData = {};

    expenses.forEach(item => {
        const amt = Number(item.amount);
        total += amt;
        catData[item.category] = (catData[item.category] || 0) + amt;

        const li = document.createElement('li');
        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                <span><strong>${item.description}</strong><br><small>${item.category}</small></span>
                <span>${rupee.format(amt)} <button onclick="deleteExp('${item.id}')" style="color:red; border:none; background:none; cursor:pointer;">✕</button></span>
            </div>
        `;
        list.appendChild(li);
    });

    document.getElementById('total-amount').innerText = rupee.format(total);

    // Render
