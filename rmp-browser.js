/* rmp-browser.js  –  ES-module wrapper for RateMyProfessors (2025-05 schema) */

const ENDPOINT = "https://www.ratemyprofessors.com/graphql";

/* tiny helper to run GraphQL */
async function gql(query, variables = {}) {
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) throw new Error(`RMP HTTP ${resp.status}`);
  const json = await resp.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

/* ── 1. searchSchool ─────────────────────────────────────────────── */
export async function searchSchool(text) {
  const Q = `
    query ($text:String!) {
      newSearch {
        schools(query:{text:$text}) {
          edges { node { id name } }
        }
      }
    }`;
  const data = await gql(Q, { text });
  return data?.newSearch?.schools?.edges ?? [];
}

/* ── 2. searchProfessorsAtSchoolId ───────────────────────────────── */
export async function searchProfessorsAtSchoolId(text, schoolID) {
  const Q = `
    query ($text:String!, $schoolID:ID!) {
      newSearch {
        teachers(query:{text:$text, schoolID:$schoolID}) {
          edges {
            cursor
            node {
              id legacyId firstName lastName department
              avgRating avgDifficulty numRatings wouldTakeAgainPercent
            }
          }
        }
      }
    }`;
  const data = await gql(Q, { text, schoolID });
  return data?.newSearch?.teachers?.edges ?? [];
}

/* ── 3. getProfessorRatingAtSchoolId ─────────────────────────────── */
export async function getProfessorRatingAtSchoolId(name, schoolID) {
  const edges = await searchProfessorsAtSchoolId(name, schoolID);
  if (!edges.length) throw new Error("Professor not found.");
  const teacherID = edges[0].node.id;

  const INFO_Q = `
    query ($id:ID!) {
      node(id:$id) {
        ... on Teacher {
          legacyId firstName lastName department
          avgRating avgDifficulty numRatings wouldTakeAgainPercent
        }
      }
    }`;
  const info = (await gql(INFO_Q, { id: teacherID })).node;

  return {
    avgRating: info.avgRating,
    avgDifficulty: info.avgDifficulty,
    wouldTakeAgainPercent: info.wouldTakeAgainPercent,
    numRatings: info.numRatings,
    formattedName: `${info.firstName} ${info.lastName}`,
    department: info.department,
    link: `https://www.ratemyprofessors.com/professor/${info.legacyId}`,
  };
}

/* namespace export so `import * as rmp` works */
export default {
  searchSchool,
  searchProfessorsAtSchoolId,
  getProfessorRatingAtSchoolId,
};
