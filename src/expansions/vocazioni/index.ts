/** La Dinastia a vocazioni: Le vie dei mercanti e Spade e Castelli insieme (docs/vocazioni.md). Non è una tessera: la sceglie la Dinastia. */
import type { Expansion } from '../types';
import { rules } from './rules';
import { view } from './view';

const expansion: Expansion = { order: 9, nascosta: true, rules, view };
export default expansion;
