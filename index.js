import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js"
import { getDatabase, ref, push, onValue, remove, set } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-database.js"

// -------------------------------------------------------------
// REJESTRACJA SERVICE WORKERA (PWA) + AUTOMATYCZNY PROMPT AKTUALIZACJI
// -------------------------------------------------------------
function showUpdateNotification() {
    if (document.getElementById("pwa-update-toast")) return;

    const toast = document.createElement("div");
    toast.id = "pwa-update-toast";
    toast.style.cssText = "position:fixed; bottom:95px; left:50%; transform:translateX(-50%); width:90%; max-width:350px; background:#1e293b; color:#ffffff; padding:12px 16px; border-radius:14px; display:flex; align-items:center; justify-content:space-between; box-shadow:0 8px 24px rgba(0,0,0,0.25); z-index:9999; animation:slideUp 0.3s ease-out;";

    toast.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; font-size:13px; font-weight:500;">
            <i class="fa-solid fa-cloud-arrow-down" style="color:#10b981; font-size:18px;"></i>
            <span>Dostępna nowa wersja!</span>
        </div>
        <button id="pwa-reload-btn" style="background:#10b981; color:#ffffff; border:none; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer;">
            Odśwież
        </button>
    `;

    document.body.appendChild(toast);

    document.getElementById("pwa-reload-btn").addEventListener("click", () => {
        window.location.reload();
    });
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('Service Worker zarejestrowany pomyślnie');

                // Wykrycie nowej wersji oczekującej lub instalującej się
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (!newWorker) return;

                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateNotification();
                        }
                    });
                });
            })
            .catch(err => console.error('Błąd rejestracji SW:', err));

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!refreshing) {
                refreshing = true;
                window.location.reload();
            }
        });
    });
}

// -------------------------------------------------------------
// FIREBASE & KLUCZ AI
// -------------------------------------------------------------
const appSettings = {
    databaseURL: "https://playground-6e4d1-default-rtdb.europe-west1.firebasedatabase.app/"
}

const GEMINI_API_KEY = "AQ.Ab8RN6J2wWQfW1pug-viuRkZAI5uAuL7j6st7yICjO8yF7aSCg" 

const app = initializeApp(appSettings)
const database = getDatabase(app)
const shoppingListInDB = ref(database, "shoppingList")
const learnedDictInDB = ref(database, "learnedDictionary")

const inputElementEl = document.getElementById("input-element")
const inputFieldEl = document.getElementById("input-field")
const addButtonEl = document.getElementById("add-button")
const navAddBtn = document.getElementById("nav-add-btn")
const voiceBtn = document.getElementById("voice-btn")

const shoppingCategoriesContainer = document.getElementById("shopping-categories-container")
const completedListEl = document.getElementById("completed-list")
const completedSectionEl = document.getElementById("completed-section")
const completedCountEl = document.getElementById("completed-count")
const clearCompletedBtn = document.getElementById("clear-completed-btn")

let completedItemIds = []
let prevActiveCount = -1
let learnedDictionary = {}

onValue(learnedDictInDB, (snapshot) => {
    if (snapshot.exists()) {
        learnedDictionary = snapshot.val()
    }
})

// -------------------------------------------------------------
// CHOWANIE PASKA WPISYWANIA PO KLIKNIĘCIU W TŁO
// -------------------------------------------------------------
document.addEventListener("click", (e) => {
    if (!inputElementEl.classList.contains("hidden")) {
        if (
            !inputElementEl.contains(e.target) && 
            !navAddBtn.contains(e.target) &&
            !e.target.closest(".item-card") &&
            !editModalOverlay.contains(e.target)
        ) {
            inputElementEl.classList.add("hidden");
        }
    }
});

// -------------------------------------------------------------
// WSKAŹNIK TRYBU OFFLINE (Brak sieci w sklepie)
// -------------------------------------------------------------
const offlineBanner = document.createElement("div");
offlineBanner.style.cssText = "display:none; background:#ef4444; color:#fff; text-align:center; padding:6px; font-size:12px; font-weight:bold; position:sticky; top:0; z-index:10000; border-radius:8px; margin-bottom:10px;";
offlineBanner.innerHTML = '<i class="fa-solid fa-plane-slash" style="margin-right:6px;"></i> Brak sieci - działasz w trybie offline';
shoppingCategoriesContainer.parentNode.insertBefore(offlineBanner, shoppingCategoriesContainer);

function updateOnlineStatus() {
    if (!navigator.onLine) {
        offlineBanner.style.display = "block";
    } else {
        offlineBanner.style.display = "none";
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// -------------------------------------------------------------
// MODAL EDYCJI
// -------------------------------------------------------------
const editModalOverlay = document.createElement("div");
editModalOverlay.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999; display:none; justify-content:center; align-items:center; backdrop-filter:blur(3px);";

const editModalBox = document.createElement("div");
editModalBox.style.cssText = "background:#fff; padding:20px; border-radius:15px; width:90%; max-width:320px; box-shadow:0 10px 25px rgba(0,0,0,0.2); display:flex; flex-direction:column; gap:15px;";

editModalBox.innerHTML = `
    <h3 style="margin:0; color:#1e293b; text-align:center; font-size:18px;">Edytuj produkt</h3>
    <div>
        <label style="font-size:12px; color:#64748b; font-weight:bold;">Nazwa produktu</label>
        <input type="text" id="edit-name-inp" style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; margin-top:5px; font-size:16px; box-sizing:border-box;">
    </div>
    <div>
        <label style="font-size:12px; color:#64748b; font-weight:bold;">Gramatura / Ilość</label>
        <input type="text" id="edit-amount-inp" placeholder="np. 200g, 2 szt." style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:8px; margin-top:5px; font-size:16px; box-sizing:border-box;">
    </div>
    <div style="display:flex; gap:10px; margin-top:5px;">
        <button id="edit-save-btn" style="flex:1; background:#10b981; color:white; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">Zapisz</button>
        <button id="edit-del-btn" style="flex:1; background:#ef4444; color:white; border:none; padding:10px; border-radius:8px; font-weight:bold; cursor:pointer;">Usuń</button>
    </div>
    <button id="edit-cancel-btn" style="background:transparent; color:#64748b; border:none; padding:5px; font-size:14px; cursor:pointer;">Anuluj</button>
`;

editModalOverlay.appendChild(editModalBox);
document.body.appendChild(editModalOverlay);

let currentEditId = null;
let currentEditData = null;

function openEditModal(id, data) {
    currentEditId = id;
    currentEditData = data;
    
    const nameInp = document.getElementById("edit-name-inp");
    const amountInp = document.getElementById("edit-amount-inp");
    
    nameInp.value = typeof data === "object" ? data.name : data;
    amountInp.value = typeof data === "object" && data.amount ? data.amount : "";
    
    editModalOverlay.style.display = "flex";
}

function closeEditModal() {
    editModalOverlay.style.display = "none";
    currentEditId = null;
    currentEditData = null;
}

document.getElementById("edit-cancel-btn").addEventListener("click", closeEditModal);

document.getElementById("edit-save-btn").addEventListener("click", () => {
    if (!currentEditId) return;
    const newName = document.getElementById("edit-name-inp").value.trim();
    const newAmount = document.getElementById("edit-amount-inp").value.trim();
    
    if (newName) {
        const itemRef = ref(database, `shoppingList/${currentEditId}`);
        const isDone = typeof currentEditData === "object" ? Boolean(currentEditData.done) : false;
        const cat = typeof currentEditData === "object" && currentEditData.category ? currentEditData.category : "other";
        const createdAt = typeof currentEditData === "object" && currentEditData.createdAt ? currentEditData.createdAt : Date.now();
        
        set(itemRef, {
            name: newName,
            amount: newAmount,
            done: isDone,
            category: cat,
            createdAt: createdAt
        });
    }
    closeEditModal();
});

document.getElementById("edit-del-btn").addEventListener("click", () => {
    if (!currentEditId) return;
    
    const newName = document.getElementById("edit-name-inp").value.trim() || (typeof currentEditData === "object" ? currentEditData.name : currentEditData);
    const newAmount = document.getElementById("edit-amount-inp").value.trim();
    const cat = typeof currentEditData === "object" && currentEditData.category ? currentEditData.category : "other";
    const createdAt = typeof currentEditData === "object" && currentEditData.createdAt ? currentEditData.createdAt : Date.now();
    
    const itemRef = ref(database, `shoppingList/${currentEditId}`);
    set(itemRef, {
        name: newName,
        amount: newAmount,
        done: true,
        category: cat,
        createdAt: createdAt
    });
    
    closeEditModal();
});

// -------------------------------------------------------------
// TWORZENIE ANIMOWANEGO PASKA POSTĘPU
// -------------------------------------------------------------
const progressStyle = document.createElement("style");
progressStyle.textContent = `
    @keyframes progressStripes {
        0% { background-position: 0 0; }
        100% { background-position: 40px 0; }
    }
    .progress-bar-animated {
        background-image: linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.2) 25%,
            transparent 25%,
            transparent 50%,
            rgba(255, 255, 255, 0.2) 50%,
            rgba(255, 255, 255, 0.2) 75%,
            transparent 75%,
            transparent
        );
        background-size: 40px 40px;
        animation: progressStripes 1s linear infinite;
    }
`;
document.head.appendChild(progressStyle);

const progressWrapper = document.createElement("div");
progressWrapper.style.cssText = "width:100%; height:26px; background:#e2e8f0; border-radius:13px; margin-top:15px; overflow:hidden; display:none; position:relative; box-shadow:inset 0 1px 3px rgba(0,0,0,0.1);";

const progressBar = document.createElement("div");
progressBar.className = "progress-bar-animated";
progressBar.style.cssText = "width:0%; height:100%; background-color:#10b981; transition:width 0.3s ease;";

const progressText = document.createElement("div");
progressText.style.cssText = "position:absolute; width:100%; text-align:center; top:0; left:0; font-size:12px; line-height:26px; color:#1e293b; font-weight:bold; text-shadow:0px 0px 3px rgba(255,255,255,0.9);";

progressWrapper.appendChild(progressBar);
progressWrapper.appendChild(progressText);
inputElementEl.parentNode.insertBefore(progressWrapper, inputElementEl.nextSibling);

function updateProgress(percent, text) {
    if (percent < 0) { 
        progressWrapper.style.display = "none"; 
        return; 
    }
    progressWrapper.style.display = "block";
    progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    progressText.textContent = text;
}

// -------------------------------------------------------------
// DZIAŁY SKLEPOWE, SŁOWNIK & KOLORY EXTRA
// -------------------------------------------------------------
const CATEGORY_DEFS = {
    chem: { name: "Chemia i Dom", icon: "fa-spray-can-sparkles", color: "#0e7490", bg: "#cffafe" },
    bakery: { name: "Pieczywo", icon: "fa-bread-slice", color: "#b45309", bg: "#fef3c7" },
    produce: { name: "Warzywa i Owoce", icon: "fa-carrot", color: "#15803d", bg: "#dcfce7" },
    dairy: { name: "Nabiał i Jaja", icon: "fa-cheese", color: "#a16207", bg: "#fef9c3" },
    meat: { name: "Mięso i Ryby", icon: "fa-drumstick-bite", color: "#b91c1c", bg: "#fee2e2" },
    pantry: { name: "Spiżarnia i Przyprawy", icon: "fa-jar", color: "#c2410c", bg: "#ffedd5" },
    drinks: { name: "Napoje i Przekąski", icon: "fa-bottle-water", color: "#7e22ce", bg: "#f3e8ff" },
    other: { name: "Inne artykuły", icon: "fa-basket-shopping", color: "#475569", bg: "#f1f5f9" }
}

const EXTRA_PALETTES = [
    { color: "#be185d", bg: "#fce7f3" },
    { color: "#0f766e", bg: "#ccfbf1" },
    { color: "#4338ca", bg: "#e0e7ff" }, 
    { color: "#be123c", bg: "#ffe4e6" },
    { color: "#4d7c0f", bg: "#ecfccb" },
    { color: "#a21caf", bg: "#fae8ff" }, 
    { color: "#0369a1", bg: "#e0f2fe" }
]

function getPaletteForNewCategory(catName) {
    let hash = 0;
    for (let i = 0; i < catName.length; i++) {
        hash = catName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return EXTRA_PALETTES[Math.abs(hash) % EXTRA_PALETTES.length];
}

function normalizeText(text) {
    return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").trim()
}

const KEYWORD_RULES = [
    { cat: "chem", words: ["zmywark", "tabletki", "kostki", "proszek", "kapsulki", "ludwik", "somat", "plyn", "gabk", "odplami", "wybiel", "kret", "ariel", "papier toalet", "recznik", "mydl", "szampon", "past", "szczoteczk", "dezodorant", "podpask", "mop", "bateri", "zarowk", "worki"] },
    { cat: "bakery", words: ["chleb", "bulk", "bagiet", "rogal", "tost", "kajzer", "drozdz"] },
    { cat: "produce", words: ["warzyw", "owoc", "pomidor", "ogor", "ziemniak", "cebul", "czosn", "march", "salat", "papryk", "jabl", "banan", "cytryn", "truskaw", "malin", "sliwk"] },
    { cat: "dairy", words: ["nabial", "mlek", "ser", "masl", "jogurt", "smietan", "kefir", "twarog", "jaj"] },
    { cat: "meat", words: ["mies", "szynk", "kurczak", "kielbas", "parowk", "schab", "wolowin", "ryb", "losos", "krewetk", "salami"] },
    { cat: "pantry", words: ["makaron", "ryz", "kasz", "olej", "oliwa", "ketchup", "majonez", "sos", "ocet", "sol", "cukier", "pieprz", "przypraw", "dzem", "passat"] },
    { cat: "drinks", words: ["napoj", "wod", "sok", "col", "pepsi", "piw", "wino", "kaw", "herbat", "chips", "czekolad", "baton", "lody", "energetyk"] }
]

function detectCategory(name) {
    const normalized = normalizeText(name)
    if (learnedDictionary[normalized] && learnedDictionary[normalized] !== "other") {
        return learnedDictionary[normalized];
    }
    for (const rule of KEYWORD_RULES) {
        if (rule.words.some(w => normalized.includes(w))) {
            return rule.cat;
        }
    }
    return "unknown" 
}

// -------------------------------------------------------------
// UNIWERSALNA FUNKCJA DO ZAPYTAŃ AI (Z AKTUALNYMI MODELAMI)
// -------------------------------------------------------------
async function callGeminiAPI(prompt, jsonMode = false) {
    if (!GEMINI_API_KEY || !navigator.onLine) return null;

    const endpoints = [
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-latest:generateContent"
    ];

    const bodyPayload = {
        contents: [{ parts: [{ text: prompt }] }]
    };

    if (jsonMode) {
        bodyPayload.generationConfig = {
            responseMimeType: "application/json"
        };
    }

    for (const url of endpoints) {
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "x-goog-api-key": GEMINI_API_KEY.trim()
                },
                body: JSON.stringify(bodyPayload)
            });

            if (res.ok) {
                const data = await res.json();
                const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                if (text) return text;
            } else {
                console.warn(`Endpoint ${url} zwrócił status ${res.status}:`, await res.text());
            }
        } catch (err) {
            console.warn(`Błąd połączenia z ${url}:`, err);
        }
    }

    return null;
}

// -------------------------------------------------------------
// KATEGORYZACJA PRODUKTÓW (AI)
// -------------------------------------------------------------
async function askAIToCategorize(itemName) {
    const prompt = `Jesteś asystentem zakupów. Do jakiego działu w sklepie należy produkt: "${itemName}"?
Zwróć TYLKO JEDNO krótkie słowo. 
Jeśli to podstawowy produkt użyj: produce, bakery, dairy, meat, pantry, drinks, chem. 
Jeśli produkt kompletnie nie pasuje, WYMYŚL jedno krótkie słowo po polsku (bez polskich znaków), które opisze nowy dział (np. rtv, biuro, ogrod, apteka, zwierzeta).`;

    const result = await callGeminiAPI(prompt, false);
    if (!result) return "other";

    const aiCategory = result.toLowerCase().trim();
    return aiCategory.replace(/[^a-z0-9]/g, '') || "other";
}

// -------------------------------------------------------------
// INTELIGENTNY PODZIAŁ PODYKTOWANEGO TEKSTU I PRZEPISÓW
// -------------------------------------------------------------
async function extractItemsWithAI(textBlock) {
    const prompt = `Użytkownik wprowadził podyktowany tekst lub listę produktów: "${textBlock}".
Twoim zadaniem jest wyodrębnić poszczególne artykuły zakupowe. 
Bezwzględnie łącz wielowyrazowe nazwy w pojedyncze produkty (np. "mięso mielone", "makaron do spaghetti", "papier toaletowy", "passata pomidorowa").
Rozpoznaj i oddziel ewentualne ilości lub gramatury (np. "2 kg", "500g", "2 sztuki"). Jeśli brak ilości, wpisz pusty ciąg "".
Popraw ewentualne drobne literówki wynikające z mowy.

Zwróć odpowiedź WYŁĄCZNIE jako poprawną tablicę JSON:
[{"name": "mięso mielone", "amount": ""}, {"name": "makaron do spaghetti", "amount": ""}, {"name": "passata", "amount": ""}]`;

    const rawJson = await callGeminiAPI(prompt, true);
    if (!rawJson) return null;

    try {
        let cleanedJson = rawJson;
        const startIdx = cleanedJson.indexOf('[');
        const endIdx = cleanedJson.lastIndexOf(']');
        if (startIdx !== -1 && endIdx !== -1) {
            cleanedJson = cleanedJson.substring(startIdx, endIdx + 1);
        }
        const parsed = JSON.parse(cleanedJson);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
    } catch (e) {
        console.error("Błąd parsowania JSON z AI:", e);
        return null;
    }
}

// -------------------------------------------------------------
// DODAWANIE PRODUKTÓW & ONE-BY-ONE PROCESSING
// -------------------------------------------------------------
async function addItemsFromString(rawText, isVoice = false) {
    if (!rawText || !rawText.trim()) return;

    inputFieldEl.disabled = true;
    let isLongText = rawText.length > 80 || rawText.includes("\n");
    let useAIParsing = (isVoice || isLongText) && navigator.onLine;
    let itemsToProcess = [];

    if (useAIParsing) {
        updateProgress(25, isVoice ? "🎙️ AI analizuje podyktowaną listę..." : "🤖 AI czyta przepis...");

        const parsedItems = await extractItemsWithAI(rawText);

        if (parsedItems && Array.isArray(parsedItems) && parsedItems.length > 0) {
            itemsToProcess = parsedItems;
        } else {
            const parts = rawText.split(/,|\soraz\s|\splus\s/i).map(i => i.trim()).filter(Boolean);
            itemsToProcess = parts.map(itemStr => ({ name: itemStr, amount: "" }));
        }
    } else {
        const rawItems = rawText.split(/,|\si\s|\soraz\s|\splus\s/i).map(i => i.trim()).filter(i => i.length > 0);
        itemsToProcess = rawItems.map(itemStr => ({ name: itemStr, amount: "" }));
    }

    inputFieldEl.value = "";
    
    let processedCount = 0;
    const totalItems = itemsToProcess.length;

    for (const itemObj of itemsToProcess) {
        const itemName = itemObj.name ? itemObj.name.trim() : "";
        const itemAmount = itemObj.amount ? itemObj.amount.trim() : "";
        if (!itemName) continue;

        let currentPercent = useAIParsing 
            ? 40 + (processedCount / totalItems) * 60 
            : (processedCount / totalItems) * 100;
            
        updateProgress(currentPercent, `Dodawanie: ${itemName} (${processedCount + 1}/${totalItems})`);

        const normalized = normalizeText(itemName);
        let cat = detectCategory(itemName);

        if (cat !== "unknown") {
            push(shoppingListInDB, { 
                name: itemName, 
                amount: itemAmount, 
                done: false, 
                category: cat, 
                createdAt: Date.now() 
            });
        } else {
            const newItemRef = push(shoppingListInDB, { 
                name: itemName, 
                amount: itemAmount, 
                done: false, 
                category: "other", 
                createdAt: Date.now() 
            });
            
            if (navigator.onLine) {
                const aiCategory = await askAIToCategorize(itemName);
                await new Promise(resolve => setTimeout(resolve, 300));

                if (aiCategory && aiCategory !== "other") {
                    set(ref(database, `shoppingList/${newItemRef.key}/category`), aiCategory);
                    set(ref(database, `learnedDictionary/${normalized}`), aiCategory);
                }
            }
        }
        processedCount++;
    }

    updateProgress(100, "✅ Gotowe!");
    setTimeout(() => {
        updateProgress(-1, "");
        inputFieldEl.disabled = false;
        if (isVoice) {
            inputElementEl.classList.add("hidden");
        }
    }, 1200);
}

addButtonEl.addEventListener("click", () => addItemsFromString(inputFieldEl.value, false))
inputFieldEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.keyCode === 13) {
        if (!e.shiftKey) {
            e.preventDefault();
            addItemsFromString(inputFieldEl.value, false)
        }
    }
})

navAddBtn.addEventListener("click", () => {
    if (viewShopping.classList.contains("hidden")) {
        switchToShoppingTab()
    }
    inputElementEl.classList.remove("hidden");
    inputFieldEl.focus()
})

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = "pl-PL";
    recognition.interimResults = false;
    
    voiceBtn.addEventListener("click", () => {
        try {
            recognition.start();
            voiceBtn.classList.add("recording")
        } catch (err) {
            recognition.stop();
            voiceBtn.classList.remove("recording")
        }
    })
    
    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        addItemsFromString(transcript, true);
        voiceBtn.classList.remove("recording")
    }
    
    recognition.onerror = () => voiceBtn.classList.remove("recording")
    recognition.onend = () => voiceBtn.classList.remove("recording")
} else {
    voiceBtn.style.display = "none"
}

// -------------------------------------------------------------
// DYNAMICZNE RENDEROWANIE & LOGIKA KLIKNIĘĆ (LONG-PRESS + DOUBLE-TAP)
// -------------------------------------------------------------
onValue(shoppingListInDB, (snapshot) => {
    shoppingCategoriesContainer.innerHTML = ""
    completedListEl.innerHTML = ""
    completedItemIds = []

    if (snapshot.exists()) {
        const itemsArray = Object.entries(snapshot.val())
        let activeCount = 0
        const groupedActive = {} 

        itemsArray.forEach(([id, data]) => {
            const name = typeof data === "object" ? data.name : data
            const amount = typeof data === "object" && data.amount ? data.amount : ""
            const isDone = typeof data === "object" ? Boolean(data.done) : false
            
            let cat = typeof data === "object" && data.category ? data.category : detectCategory(name)
            if (cat === "unknown") cat = "other"

            const li = document.createElement("li")
            li.className = "item-card"
            
            const amountHtml = amount ? `<span style="font-size:0.85em; color:#64748b; margin-left:8px; font-weight:normal;">(${amount})</span>` : "";
            li.innerHTML = `<div class="item-left"><span class="check-circle"></span><span>${name}${amountHtml}</span></div>`

            let lastClickTime = 0;
            let pressTimer = null;
            let isLongPress = false;

            const startPress = () => {
                isLongPress = false;
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    if (navigator.vibrate) navigator.vibrate([50, 50]);
                    openEditModal(id, data);
                }, 600); 
            };

            const cancelPress = () => {
                clearTimeout(pressTimer);
            };

            li.addEventListener("touchmove", cancelPress, { passive: true });
            li.addEventListener("mousedown", startPress);
            li.addEventListener("touchstart", startPress, { passive: true });
            li.addEventListener("mouseup", cancelPress);
            li.addEventListener("mouseleave", cancelPress);
            li.addEventListener("touchend", cancelPress);
            li.addEventListener("touchcancel", cancelPress);

            li.addEventListener("click", (e) => {
                e.preventDefault();
                if (isLongPress) return; 

                const currentTime = new Date().getTime();
                const timeDiff = currentTime - lastClickTime;
                
                if (timeDiff > 0 && timeDiff < 400) { 
                    if (navigator.vibrate) navigator.vibrate(35);
                    const itemRef = ref(database, `shoppingList/${id}`);
                    set(itemRef, { 
                        name: name, 
                        amount: amount, 
                        done: !isDone, 
                        category: cat, 
                        createdAt: data.createdAt || Date.now() 
                    });
                    lastClickTime = 0; 
                } else {
                    lastClickTime = currentTime;
                }
            })

            if (isDone) {
                completedItemIds.push(id)
                completedListEl.append(li)
            } else {
                activeCount++
                if (!groupedActive[cat]) groupedActive[cat] = []
                groupedActive[cat].push(li)
            }
        })

        const classicOrder = ["produce", "bakery", "dairy", "meat", "pantry", "drinks", "chem"]
        
        const renderCategoryBlock = (catKey) => {
            const list = groupedActive[catKey]
            if (list && list.length > 0) {
                const groupDiv = document.createElement("div")
                groupDiv.className = "category-group"
                
                let def = CATEGORY_DEFS[catKey];
                
                if (!def) {
                    const dynamicPalette = getPaletteForNewCategory(catKey);
                    def = { 
                        name: catKey.toUpperCase(),
                        icon: "fa-box-open", 
                        color: dynamicPalette.color, 
                        bg: dynamicPalette.bg 
                    }
                }

                groupDiv.innerHTML = `
                    <div class="category-badge" style="background-color: ${def.bg}; color: ${def.color};">
                        <i class="fa-solid ${def.icon}"></i>
                        <span>${def.name}</span>
                    </div>`
                const ul = document.createElement("ul")
                list.forEach(itemLi => ul.appendChild(itemLi))
                groupDiv.appendChild(ul)
                shoppingCategoriesContainer.appendChild(groupDiv)
            }
        }

        classicOrder.forEach(renderCategoryBlock)

        Object.keys(groupedActive).forEach(catKey => {
            if (!classicOrder.includes(catKey) && catKey !== "other") {
                renderCategoryBlock(catKey)
            }
        })

        if (groupedActive["other"]) renderCategoryBlock("other")

        if (prevActiveCount > 0 && activeCount === 0 && completedItemIds.length > 0) {
            if (typeof confetti === "function") {
                confetti({ particleCount: 90, spread: 80, origin: { y: 0.85 } })
            }
            if (navigator.vibrate) {
                navigator.vibrate([100, 50, 100, 50, 250])
            }
        }
        prevActiveCount = activeCount

        if (activeCount === 0 && completedItemIds.length === 0) {
            shoppingCategoriesContainer.innerHTML = "<p style='text-align:center; opacity:0.6; margin-top:20px;'>Lista jest pusta... jeszcze!</p>"
        }
    } else {
        shoppingCategoriesContainer.innerHTML = "<p style='text-align:center; opacity:0.6; margin-top:20px;'>Lista jest pusta... jeszcze!</p>"
        prevActiveCount = 0
    }

    if (completedItemIds.length > 0) {
        completedSectionEl.classList.remove("hidden")
        completedCountEl.textContent = completedItemIds.length
    } else {
        completedSectionEl.classList.add("hidden")
    }
})

clearCompletedBtn.addEventListener("click", () => {
    if (confirm("Usunąć wszystkie kupione produkty z koszyka?")) {
        completedItemIds.forEach(id => remove(ref(database, `shoppingList/${id}`)))
    }
})

// -------------------------------------------------------------
// SPA ROUTER & POGODA
// -------------------------------------------------------------
const tabShopping = document.getElementById("tab-shopping")
const tabWeather = document.getElementById("tab-weather")
const viewShopping = document.getElementById("view-shopping")
const viewWeather = document.getElementById("view-weather")
let weatherLoadedOnce = false

function switchToShoppingTab() {
    tabShopping.classList.add("active");
    tabWeather.classList.remove("active");
    viewShopping.classList.remove("hidden");
    viewWeather.classList.add("hidden");
}

tabShopping.addEventListener("click", switchToShoppingTab)

tabWeather.addEventListener("click", () => {
    tabWeather.classList.add("active");
    tabShopping.classList.remove("active");
    viewWeather.classList.remove("hidden");
    viewShopping.classList.add("hidden");
    inputElementEl.classList.add("hidden");
    if (!weatherLoadedOnce) {
        initWeather();
        weatherLoadedOnce = true;
    }
})

let currentCoords = JSON.parse(localStorage.getItem("weather_coords")) || { lat: 52.2297, lon: 21.0122, city: "Warszawa" }

const weatherCodeMap = {
    0: { desc: "Bezchmurnie", icon: "fa-sun" },
    1: { desc: "Przeważnie słonecznie", icon: "fa-cloud-sun" },
    2: { desc: "Umiarkowane zachmurzenie", icon: "fa-cloud-sun" },
    3: { desc: "Pochmurno", icon: "fa-cloud" },
    45: { desc: "Mgła", icon: "fa-smog" },
    48: { desc: "Oszroniona mgła", icon: "fa-smog" },
    51: { desc: "Lekka mżawka", icon: "fa-cloud-rain" },
    53: { desc: "Mżawka", icon: "fa-cloud-rain" },
    55: { desc: "Gęsta mżawka", icon: "fa-cloud-showers-heavy" },
    61: { desc: "Lekki deszcz", icon: "fa-cloud-rain" },
    63: { desc: "Umiarkowany deszcz", icon: "fa-cloud-showers-heavy" },
    65: { desc: "Ulewny deszcz", icon: "fa-cloud-showers-water" },
    71: { desc: "Lekki śnieg", icon: "fa-snowflake" },
    73: { desc: "Śnieg", icon: "fa-snowflake" },
    75: { desc: "Mocny śnieg", icon: "fa-snowflake" },
    80: { desc: "Przelotne opady", icon: "fa-cloud-sun-rain" },
    81: { desc: "Ulewa", icon: "fa-cloud-showers-heavy" },
    82: { desc: "Gwałtowna ulewa", icon: "fa-cloud-showers-water" },
    95: { desc: "Burza", icon: "fa-bolt" },
    96: { desc: "Burza z gradem", icon: "fa-cloud-bolt" }
}

document.getElementById("refresh-gps").addEventListener("click", getDeviceLocation)

function initWeather() {
    const cachedData = localStorage.getItem("weather_cache")
    if (cachedData) {
        try {
            renderWeather(JSON.parse(cachedData))
        } catch (e) {}
    } else {
        document.getElementById("city-name").textContent = currentCoords.city
    }
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                currentCoords.lat = pos.coords.latitude;
                currentCoords.lon = pos.coords.longitude;
                localStorage.setItem("weather_coords", JSON.stringify(currentCoords));
                fetchWeatherData();
                fetchCityName(currentCoords.lat, currentCoords.lon);
            },
            () => fetchWeatherData(),
            { timeout: 3000, maximumAge: 600000, enableHighAccuracy: false }
        )
    } else {
        fetchWeatherData()
    }
}

function getDeviceLocation() {
    if (navigator.geolocation) {
        document.getElementById("weather-desc").textContent = "Lokalizowanie..."
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                currentCoords.lat = pos.coords.latitude;
                currentCoords.lon = pos.coords.longitude;
                localStorage.setItem("weather_coords", JSON.stringify(currentCoords));
                fetchWeatherData();
                fetchCityName(currentCoords.lat, currentCoords.lon);
            },
            () => fetchWeatherData(),
            { timeout: 5000, enableHighAccuracy: false }
        )
    }
}

async function fetchCityName(lat, lon) {
    try {
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pl`)
        const data = await res.json();
        currentCoords.city = data.city || data.locality || data.principalSubdivision || "Moja lokalizacja"
        localStorage.setItem("weather_coords", JSON.stringify(currentCoords));
        document.getElementById("city-name").textContent = currentCoords.city
    } catch {}
}

async function fetchWeatherData() {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${currentCoords.lat}&longitude=${currentCoords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max&timezone=auto&forecast_days=4`
    try {
        const res = await fetch(url);
        const data = await res.json();
        localStorage.setItem("weather_cache", JSON.stringify(data));
        renderWeather(data);
    } catch (err) {
        console.error(err);
    }
}

function renderWeather(data) {
    const current = data.current;
    const weatherInfo = weatherCodeMap[current.weather_code] || { desc: "Zmiennie", icon: "fa-cloud" };
    
    document.getElementById("city-name").textContent = currentCoords.city
    document.getElementById("temp-current").textContent = `${Math.round(current.temperature_2m)}°`
    document.getElementById("weather-desc").textContent = weatherInfo.desc
    document.getElementById("temp-feels").textContent = `${Math.round(current.apparent_temperature)}°C`
    document.getElementById("weather-icon").innerHTML = `<i class="fa-solid ${weatherInfo.icon}"></i>`
    document.getElementById("wind-speed").textContent = `${Math.round(current.wind_speed_10m)} km/h`
    document.getElementById("humidity").textContent = `${current.relative_humidity_2m}%`
    
    const hrIdx = new Date().getHours()
    document.getElementById("rain-chance").textContent = `${data.hourly?.precipitation_probability?.[hrIdx] || 0}%`
    document.getElementById("uv-index").textContent = Math.round(data.daily?.uv_index_max?.[0] || 0)
    
    renderClothingTip(current, data.hourly);
    renderHourly(data.hourly);
    renderDaily(data.daily);
}

function renderClothingTip(current, hourly) {
    const temp = current.temperature_2m;
    const hrIdx = new Date().getHours();
    const willRain = hourly?.precipitation_probability?.slice(hrIdx, hrIdx + 6)?.some(p => p > 45);
    const tipEl = document.getElementById("tip-text");
    
    if (willRain) {
        tipEl.textContent = "W ciągu najbliższych godzin możliwy deszcz – weź parasol! ☔"
    } else if (temp <= 2) {
        tipEl.textContent = "Mróz na zewnątrz! Załóż czapkę i rękawiczki ❄️🧣"
    } else if (temp < 12) {
        tipEl.textContent = "Chłodno – przyda się cieplejsza bluza lub kurtka 🧥"
    } else if (temp >= 23) {
        tipEl.textContent = "Ciepło i słonecznie! Pamiętaj o okularach i wodzie ☀️🕶️"
    } else {
        tipEl.textContent = "Przyjemne warunki – idealny moment na spacer lub zakupy! 👟"
    }
}

function renderHourly(hourly) {
    if (!hourly || !hourly.time) return;
    const container = document.getElementById("hourly-forecast");
    container.innerHTML = "";
    
    const now = new Date();
    const currentDay = now.getDate();
    const daysShort = ["Niedz.", "Pon.", "Wt.", "Śr.", "Czw.", "Pt.", "Sob."];
    
    const isoPrefix = now.toISOString().slice(0, 13);
    let startIdx = hourly.time.findIndex(t => t.startsWith(isoPrefix));
    if (startIdx === -1) {
        startIdx = now.getHours();
    }
    
    const totalHours = Math.min(startIdx + 48, hourly.time.length);
    
    for (let i = startIdx; i < totalHours; i++) {
        const d = new Date(hourly.time[i]);
        const temp = Math.round(hourly.temperature_2m[i]);
        const rain = hourly.precipitation_probability[i];
        const icon = (weatherCodeMap[hourly.weather_code[i]] || { icon: "fa-cloud" }).icon;
        const isCurrentHour = i === startIdx;
        
        let timeLabel;
        if (isCurrentHour) {
            timeLabel = "Teraz";
        } else if (d.getDate() !== currentDay) {
            timeLabel = `${daysShort[d.getDay()]} ${d.getHours().toString().padStart(2, '0')}:00`;
        } else {
            timeLabel = `${d.getHours().toString().padStart(2, '0')}:00`;
        }
        
        const pill = document.createElement("div");
        pill.className = `hour-pill ${isCurrentHour ? 'current' : ''}`;
        pill.innerHTML = `
            <span class="hour-time">${timeLabel}</span>
            <i class="fa-solid ${icon} hour-icon"></i>
            <span class="hour-temp">${temp}°</span>
            <span class="hour-rain">${rain > 0 ? rain + '%' : ''}</span>
        `;
        container.appendChild(pill);
    }
}

function renderDaily(daily) {
    if (!daily || !daily.time) return;
    const container = document.getElementById("daily-forecast");
    container.innerHTML = "";
    const days = ["Niedz.", "Pon.", "Wt.", "Śr.", "Czw.", "Pt.", "Sob."];
    
    for (let i = 1; i < daily.time.length; i++) {
        const d = new Date(daily.time[i]);
        const icon = (weatherCodeMap[daily.weather_code[i]] || { icon: "fa-cloud" }).icon;
        
        const row = document.createElement("div");
        row.className = "daily-row";
        row.innerHTML = `
            <span class="daily-day">${days[d.getDay()]}</span>
            <i class="fa-solid ${icon} daily-icon"></i>
            <div class="daily-temps">
                <span>${Math.round(daily.temperature_2m_max[i])}°</span>
                <span class="min">${Math.round(daily.temperature_2m_min[i])}°</span>
            </div>
        `;
        container.appendChild(row);
    }
}

