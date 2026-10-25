
const candidates = [
  {
    id: 1,
    name: "Candidate A",
    skills: ["Python", "SQL", "Excel"],
    interests: ["Data Analytics"],
    availability: "Part-time"
  },
  {
    id: 2,
    name: "Candidate B",
    skills: ["Python", "SQL"],
    interests: ["AI"],
    availability: "Full-time"
  },
  {
    id: 3,
    name: "Candidate C",
    skills: ["React", "JavaScript", "UI/UX"],
    interests: ["Web Development"],
    availability: "Part-time"
  }
];

function calculateMatch(requiredSkills, candidateSkills) {
  const required = [...new Set(
    requiredSkills.map(skill => skill.toLowerCase())
  )];

  const available = new Set(
    candidateSkills.map(skill => skill.toLowerCase())
  );

  const matchedSkills = required.filter(skill =>
    available.has(skill)
  );

  const missingSkills = required.filter(skill =>
    !available.has(skill)
  );

  const score = required.length === 0
    ? 0
    : Math.round((matchedSkills.length / required.length) * 100);

  return {
    score,
    matchedSkills,
    missingSkills
  };
}

function findTeamMatches(requiredSkills, candidateList) {
  return candidateList
    .map(candidate => ({
      ...candidate,
      ...calculateMatch(requiredSkills, candidate.skills)
    }))
    .sort((a, b) => b.score - a.score);
}

// Sample startup requirements
const requiredSkills = ["Python", "SQL", "Excel", "React"];

const results = findTeamMatches(requiredSkills, candidates);

console.log("SKILL-BASED TEAM MATCHING RESULTS\n");

results.forEach(candidate => {
  console.log(`Name: ${candidate.name}`);
  console.log(`Match: ${candidate.score}%`);
  console.log(`Matched skills: ${candidate.matchedSkills.join(", ") || "None"}`);
  console.log(`Missing skills: ${candidate.missingSkills.join(", ") || "None"}`);
  console.log("----------------------------------");
});
