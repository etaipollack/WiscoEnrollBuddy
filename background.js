/* background.js – handles Rate-My-Professors requests for content scripts
   so we avoid CORS problems. */

   const RMP_EP   = "https://www.ratemyprofessors.com/graphql";
   const UW_TEXT  = "University of Wisconsin Madison";
   
   const cache = {
     schoolId : null,
     profId   : {},   // name → id
     rating   : {}    // name → { avgRating, numRatings }
   };
   
   /* -------- GraphQL helper (runs in extension context, no CORS) -------- */
   async function gql(query, variables = {}) {
     const resp = await fetch(RMP_EP, {
       method : "POST",
       headers: { "Content-Type": "application/json" },
       body   : JSON.stringify({ query, variables })
     });
     const json = await resp.json();
     if (json.errors?.length) throw new Error(json.errors[0].message);
     return json.data;
   }
   
   /* -------- lookup helpers (with simple in-memory caches) -------------- */
   async function getSchoolId() {
     if (cache.schoolId) return cache.schoolId;
   
     const Q = `query ($t:String!) {
                  newSearch { schools(query:{text:$t}) { edges{node{id}} } }
                }`;
     const data = await gql(Q, { t: UW_TEXT });
     cache.schoolId = data.newSearch.schools.edges[0]?.node.id;
     return cache.schoolId;
   }
   
   async function getProfId(name) {
     if (cache.profId[name]) return cache.profId[name];
   
     const Q = `query ($t:String!, $s:ID!) {
                  newSearch {
                    teachers(query:{text:$t, schoolID:$s}) { edges{node{id}} }
                  }
                }`;
     const data = await gql(Q, { t: name, s: await getSchoolId() });
     cache.profId[name] = data.newSearch.teachers.edges[0]?.node.id ?? null;
     return cache.profId[name];
   }
   
   async function getProfRating(name) {
    if (cache.rating[name]) return cache.rating[name];
  
    const id = await getProfId(name);
    if (!id) return null;
  
    /* grab legacyId so we can build a clickable URL */
    const Q = `query ($id:ID!) {
                 node(id:$id) {
                   ... on Teacher {
                     avgRating
                     numRatings
                     legacyId
                   }
                 }
               }`;
    const n = (await gql(Q, { id })).node;
  
    return (cache.rating[name] = {
      avgRating : n.avgRating,                    // e.g. 4.38
      numRatings: n.numRatings,                  // e.g. 112
      link      : `https://www.ratemyprofessors.com/professor/${n.legacyId}`
    });
  }
  
   
   /* -------- message bridge --------------------------------------------- */
   chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
     if (msg?.type === "getRmpRating" && msg.name) {
       getProfRating(msg.name)
         .then(r => sendResponse({ rating: r }))
         .catch(e => sendResponse({ rating: null, error: e.message }));
       return true;              // keep message channel open for the async work
     }
   });
   