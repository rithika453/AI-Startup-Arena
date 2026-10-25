'use strict';
/**
 * Match Explanation Agent (RULE-BASED, template text - no AI model writes this).
 * Turns a scored candidate into a human-readable explanation with strengths and gaps.
 */

function run({ match, requirement }) {
  const b = match.breakdown;
  const strengths = [];
  const gaps = [];

  if (match.matchedRequirements.length) {
    strengths.push(`Covers ${match.matchedRequirements.length} of ${match.matchedRequirements.length + match.missingRequirements.length} expertise areas for ${requirement.title}: ${match.matchedRequirements.join(', ')}.`);
  }
  if (b.preferredRole.fraction === 1) strengths.push(`Lists "${requirement.title}" among their preferred roles.`);
  if (b.industry.fraction === 1) strengths.push(`Has industry experience (${b.industry.detail.replace('experience in ', '')}).`);
  if (b.projects.fraction > 0) strengths.push(`Relevant project experience: ${b.projects.detail}.`);
  if (b.interests.fraction === 1) strengths.push(`Interested in this space (${b.interests.detail.replace('interest overlap: ', '')}).`);
  if (b.availability.fraction >= 0.6) strengths.push(`Availability: ${match.availability}.`);

  if (match.missingRequirements.length) gaps.push(`Not evidenced in profile: ${match.missingRequirements.join(', ')}.`);
  if (b.industry.fraction === 0) gaps.push('No listed experience in this startup\'s domain.');
  if (b.availability.fraction < 0.6) gaps.push(`Limited availability (${match.availability}).`);
  if (b.preferredRole.fraction === 0) gaps.push('Has not listed this role as preferred.');

  const reasonCount = strengths.length;
  const summary = `${match.name} scores ${match.score}/100 for ${requirement.title}`
    + (reasonCount ? `, mainly because: ${strengths[0].replace(/\.$/, '')}.` : '.');

  return {
    agent: 'match-explanation (rule-based template)',
    summary,
    strengths,
    gaps,
    caution: 'This score is a heuristic based on profile data. It does not guarantee suitability - review the full profile and talk to the candidate.',
  };
}

module.exports = { name: 'match-explanation', kind: 'rule-based', run };
