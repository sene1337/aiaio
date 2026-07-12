import { campaignOutcome, computeRank } from '../src/levels';
import { loadoutFromCard } from '../src/session';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const exitOnly = campaignOutcome(true, 8, 0, 0);
assert(exitOnly.survived, 'exit must record survival');
assert(!exitOnly.recovered, 'an exit without real task work must not recover a session');
assert(!exitOnly.perfect, 'an exit without real task work must not be perfect');
assert(computeRank(exitOnly, 0) === 'B', 'exit-only runs remain a B, not campaign credit');

const partialRecovery = campaignOutcome(true, 8, 4, 1);
assert(partialRecovery.recovered, 'half the recorded task units plus a completed task earns recovery');
assert(!partialRecovery.perfect, 'partial recovery is not a perfect recall');
assert(computeRank(partialRecovery, 0.5) === 'A', 'recovered sessions earn rank A');

const perfectRecall = campaignOutcome(true, 8, 8, 3);
assert(perfectRecall.perfect, 'all recorded task units earns perfect recall');
assert(computeRank(perfectRecall, 1) === 'S', 'perfect recall earns rank S');

const quietCard = campaignOutcome(true, 0, 0, 0);
assert(!quietCard.recovered && !quietCard.perfect, 'quiet real cards cannot fabricate campaign objectives');

const quietRealLoadout = loadoutFromCard({ session_id: 'quiet-real', errors: [], tasks: [] }, 'quiet', { mode: 'real' });
assert(quietRealLoadout.weapons.length === 0, 'quiet real cards must not receive fictional weapons');
assert(quietRealLoadout.tasks.length === 0, 'quiet real cards must not receive fictional tasks');

const quietDemoLoadout = loadoutFromCard({ session_id: 'quiet-demo', errors: [], tasks: [] }, 'demo', { mode: 'demo' });
assert(quietDemoLoadout.weapons.length >= 2, 'fictional demos retain their labeled baseline weapons');
assert(quietDemoLoadout.tasks.length >= 3, 'fictional demos retain their labeled fallback tasks');

console.log('levels campaign-outcome regressions passed');
