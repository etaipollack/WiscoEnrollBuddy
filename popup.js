// ───────────────────────────────────────────────────────────
// 1.  IMPORT ratemyprofessor-api (local copy, no remote code)
// ───────────────────────────────────────────────────────────
import * as rmp from "./rmp-browser.js";

// WELCOME SECTION

/* popup.js – first-run key capture & simple “ready” screen */

const welcome = document.getElementById("welcome");
const ready   = document.getElementById("ready");
const input   = document.getElementById("keyInput");
const saveBtn = document.getElementById("saveBtn");

async function getKey() {
  return new Promise(res =>
    chrome.storage.sync.get(["mgToken"], obj => res(obj.mgToken))
  );
}

async function setKey(token) {
  return new Promise(res =>
    chrome.storage.sync.set({ mgToken: token }, res)
  );
}

function showReady() {
  welcome.style.display = "none";
  ready.style.display   = "flex";
}

function showWelcome() {
  welcome.style.display = "flex";
  ready.style.display   = "none";
}

document.addEventListener("DOMContentLoaded", async () => {
  const existing = await getKey();
  if (existing && existing.trim() !== "") {
    showReady();
  } else {
    showWelcome();
  }
});

/* save button */
saveBtn.addEventListener("click", async () => {
  const token = input.value.trim();
  if (!token) {
    input.focus();
    return;
  }
  await setKey(token);
  showReady();
});


// ─────────────────────────────────────────────────────────────────────────────
//  MADGRADES SECTION  (unchanged except for minor refactor)
// ─────────────────────────────────────────────────────────────────────────────
/* ─── MadGrades token: retrieve once, then freeze ─────────────────── */
const TOKEN = await new Promise(resolve =>
    chrome.storage.sync.get(["mgToken"], obj => resolve(obj.mgToken || ""))
  );
  
  /* From here down, every function can use MG_TOKEN synchronously. */
  

const searchBox   = document.getElementById("search");
const resultsDiv  = document.getElementById("results");
const gradesDiv   = document.getElementById("grades");

// ---------------- fetch courses ----------------
async function fetchCourses(query) {
  const url  = `https://api.madgrades.com/v1/courses?query=${encodeURIComponent(query)}&per_page=10`;
  const resp = await fetch(url, { headers: { Authorization: `Token token=${TOKEN}` } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

function renderResults(courses) {
  resultsDiv.innerHTML = "";
  gradesDiv.textContent = "";
  if (!(courses.results?.length)) {
    resultsDiv.textContent = "No courses found.";
    searchBox.dataset.uuid = "";
    return;
  }
  const course   = courses.results[0];
  const pretty   = course.url.replace("api.","").replace("/v1/","/");
  const link     = document.createElement("a");
  link.href      = pretty;
  link.textContent = pretty;
  link.target    = "_blank";
  resultsDiv.appendChild(link);
  searchBox.dataset.uuid = course.uuid;
}

// ---------------- fetch grades ----------------
async function fetchGrades(uuid) {
  const url  = `https://api.madgrades.com/v1/courses/${uuid}/grades`;
  const resp = await fetch(url, { headers: { Authorization:`Token ${TOKEN}` } });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

function renderGrades(data) {
  gradesDiv.innerHTML = "";
  if (!(data.cumulative && data.cumulative.total)) {
    gradesDiv.textContent = "No cumulative data available.";
    return;
  }
  const total = data.cumulative.total;
  const counts = {
    A : data.cumulative.aCount  ?? 0,
    AB: data.cumulative.abCount ?? 0,
    B : data.cumulative.bCount  ?? 0,
    BC: data.cumulative.bcCount ?? 0,
    C : data.cumulative.cCount  ?? 0,
    D : data.cumulative.dCount  ?? 0,
    F : data.cumulative.fCount  ?? 0,
  };
  ["A","AB","B","BC","C","D","F"].forEach(letter=>{
    const cnt = counts[letter];
    if (!cnt) return;
    const pct = ((cnt/total)*100).toFixed(1);
    const line = document.createElement("div");
    line.innerHTML = `<span class="label">${letter}:</span> ${pct}%`;
    gradesDiv.appendChild(line);
  });
}

// ---------------- event wiring (courses) -------
searchBox.addEventListener("keyup", async (e)=>{
  const q = e.target.value.trim();
  if (q.length<3 || q===searchBox.dataset.lastQuery) return;
  searchBox.dataset.lastQuery = q;
  resultsDiv.textContent = "Searching…"; gradesDiv.textContent="";
  try { renderResults(await fetchCourses(q)); }
  catch(err){ resultsDiv.textContent = err.message.includes("401")?"Invalid API token.":"Network error — please try again."; }
});

document.getElementById("fetch-grades").addEventListener("click", async ()=>{
  const uuid = searchBox.dataset.uuid;
  if (!uuid) { console.error("No course selected."); return; }
  gradesDiv.textContent = "Fetching grades…";
  try { renderGrades(await fetchGrades(uuid)); }
  catch(err){ gradesDiv.textContent = err.message.includes("401")?"Invalid API token.":"Network error — please try again."; }
});

// ───────────────────────────────────────────────────────────
// 3.  Professor-rating functionality (using rmp package)
// ───────────────────────────────────────────────────────────
const profInput = document.getElementById("prof-search");
const profBtn   = document.getElementById("search-prof");
const profDiv   = document.getElementById("prof-result");

let uwSchoolId = null;
async function getUwSchoolId() {
  if (uwSchoolId) return uwSchoolId;
  const result = await rmp.searchSchool("University of Wisconsin Madison");
  if (!result?.length) throw new Error("UW–Madison not found.");
  uwSchoolId = result[0].node.id;
  return uwSchoolId;
}

async function fetchProfessorRating(name) {
  const schoolId = await getUwSchoolId();
  return rmp.getProfessorRatingAtSchoolId(name, schoolId);   // {avgRating,…}
}

function renderProfessor(prof) {
  profDiv.innerHTML =
    `<strong>${prof.formattedName}</strong>: ` +
    `${prof.avgRating?.toFixed(2) ?? "N/A"} / 5 ` +
    `(${prof.numRatings} ratings)`;
}

// wiring – professor
profBtn.addEventListener("click", async ()=>{
  const name = profInput.value.trim();
  if (!name) { profDiv.textContent="Enter a name."; return; }
  profDiv.textContent="Searching…";
  try { renderProfessor(await fetchProfessorRating(name)); }
  catch(err){ console.error(err); profDiv.textContent=err.message || "Network error — try again."; }
});