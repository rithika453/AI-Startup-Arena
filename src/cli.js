'use strict';
/** Tiny CLI demo: node src/cli.js "your startup idea" */
const { runTeamMatching } = require('./pipeline');

const idea = process.argv.slice(2).join(' ') || 'A marketplace connecting farmers directly with buyers to sell fresh produce, with delivery logistics';
const r = runTeamMatching({ idea });
if (!r.ok) { console.error(r.errors.join('\n')); process.exit(1); }

console.log(`IDEA: ${r.idea}`);
console.log(`Engine: ${r.engine.type} (AI model in use: ${r.engine.aiModelInUse}) | Candidates: ${r.candidateSource}`);
console.log(`Domain: ${r.domainAnalysis.primary ? r.domainAnalysis.primary.name : 'unclassified'}${r.domainAnalysis.subdomain ? ' / ' + r.domainAnalysis.subdomain.name : ''}`);
console.log(`Business type: ${r.businessModel.label}\n`);
for (const role of r.matching.byRole) {
  console.log(`[${role.priority.toUpperCase()}] ${role.title} (${role.coverage} coverage)`);
  if (!role.candidates.length) console.log('   -> NO SUITABLE CANDIDATE');
  role.candidates.forEach((c) => console.log(`   ${c.rank}. ${c.name} - ${c.score}/100 | matched: ${c.matchedRequirements.join(', ')}`));
}
if (r.missingRoles.length) console.log(`\nMissing roles: ${r.missingRoles.map((m) => m.title).join('; ')}`);
