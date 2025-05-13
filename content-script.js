/* content-script.js – clickable MadGrades & RMP labels on enroll.wisc.edu */

/* inject hover styles once */
if (!document.getElementById("uwcb-hover-style")) {
    const s = document.createElement("style");
    s.id = "uwcb-hover-style";
    s.textContent = `
      /* common base ---------------------------------------------------- */
      a.mg-link,
      a.rmp-link,
      a.mg-link:visited,
      a.rmp-link:visited {
        color: #1a73e8 !important;          /* light blue */
        text-decoration: none !important;
        cursor: pointer !important;
      }
  
      /* hover / focus / active ---------------------------------------- */
      a.mg-link:hover,
      a.mg-link:focus,
      a.mg-link:active,
      a.rmp-link:hover,
      a.rmp-link:focus,
      a.rmp-link:active {
        color: #174ea6 !important;          /* darker blue */
      }
    `;
    document.head.appendChild(s);
  }
  
  
  

/* ─── 1.  MadGrades helpers  ─────────────────────────────────────────── */
const MG_TOKEN = "a8b0fb733e674252ae423d4f52ca8799";
const MG_ORDER = ["A","AB","B","BC","C","D","F"];

const mgCache = { info:{} , grades:{} };

async function mgJSON(url) {
  const r = await fetch(url,{headers:{Authorization:`Token token=${MG_TOKEN}`}});
  if (!r.ok) throw r.status;
  return r.json();
}

/* single fetch gets uuid **and** url so we can build a link */
async function getCourseInfo(catalog) {
  if (mgCache.info[catalog]) return mgCache.info[catalog];
  const url = `https://api.madgrades.com/v1/courses?query=${encodeURIComponent(catalog)}&per_page=1`;
  const data = await mgJSON(url);
  return (mgCache.info[catalog] = data.results?.[0] ?? null);
}

async function getCumulative(uuid) {
  if (mgCache.grades[uuid]) return mgCache.grades[uuid];
  const url = `https://api.madgrades.com/v1/courses/${uuid}/grades`;
  const { cumulative } = await mgJSON(url);
  return (mgCache.grades[uuid] = cumulative);
}
function fmtGrades(c) { const t=c.total??0;
  return t ? MG_ORDER.filter(k=>c[k.toLowerCase()+"Count"]>0)
                 .map(k=>`${k} ${(100*c[k.toLowerCase()+"Count"]/t).toFixed(1)}%`).join(" • ")
           : "no data";
}

/* ─── 2.  RMP via background  ────────────────────────────────────────── */
function fetchRmp(name){
  return new Promise(res=>chrome.runtime.sendMessage({type:"getRmpRating",name},res));
}

/* ─── 3.  DOM injectors  ─────────────────────────────────────────────── */
function injectGrades(card, catalog) {
  getCourseInfo(catalog).then(info=>{
    if (!info) return;
    const uuid = info.uuid;
    const link = info.url.replace("api.","").replace("/v1/","/"); // friendly page

    getCumulative(uuid).then(cum=>{
        const a  = document.createElement("a");
        a.className = "mg-link";
        a.href      = link;
        a.target    = "_blank";
        a.style.cssText = "display:block;margin-top:4px;font-size:0.8rem;";
        a.textContent   = "MadGrades: " + fmtGrades(cum);        
      (card.querySelector(".row.title")||card).after(a);
    });
  }).catch(console.error);
}

function injectRating(node, profName) {
    fetchRmp(profName).then(({ rating }) => {
        const a = document.createElement("a");
        a.className = "rmp-link";
        a.href      = rating?.link ?? "https://www.ratemyprofessors.com";
        a.target    = "_blank";
        a.style.cssText = "margin-left:4px;font-size:0.8rem;";
        a.textContent   = `• RMP ${rating ? rating.avgRating.toFixed(2) : "N/A"} / 5`;
        
      node.after(a);
    }).catch(console.error);
  }
  
  

/* ─── 4.  Observe & act  ─────────────────────────────────────────────── */
const seenCourse = new WeakSet();
const seenProf   = new WeakSet();

new MutationObserver(scanAll)
  .observe(document.body,{childList:true,subtree:true});
scanAll();

function scanAll(){ scanCourses(); scanProfs(); }

function scanCourses(){
  document.querySelectorAll("cse-course-list-item").forEach(card=>{
    if (seenCourse.has(card)) return;
    const cat = card.querySelector(".catalog")?.textContent?.trim();
    if (cat){ seenCourse.add(card); injectGrades(card,cat); }
  });
}

function clean(s){ return s.replace(/\s+/g," ").trim(); }

function scanProfs(){
  document.querySelectorAll("span.one-instructor, cse-instructors strong")
    .forEach(el=>{
      if (seenProf.has(el)) return;
      const name = clean(el.textContent);
      if (name){ seenProf.add(el); injectRating(el,name); }
    });
}
