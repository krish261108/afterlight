import type { VoiceProfile } from '../audio/Voice';

export interface Speaker {
  name: string;
  color: string;
  voice: VoiceProfile;
}

export const SPEAKERS: Record<string, Speaker> = {
  ira: { name: 'Ira', color: '#f0a57c', voice: { gender: 'f', pitch: 0.92, rate: 0.95, slot: 0 } },
  ira1: { name: 'Ira', color: '#f3cf9e', voice: { gender: 'f', pitch: 1.12, rate: 1.0, slot: 1 } },
  kaal: { name: 'Kaal', color: '#bf96ff', voice: { gender: 'm', pitch: 0.5, rate: 0.84, slot: 0 } },
  elias: { name: 'Elias', color: '#9fc6ea', voice: { gender: 'm', pitch: 1.12, rate: 1.0, slot: 1 } },
  eliasYoung: { name: 'Elias', color: '#9fc6ea', voice: { gender: 'm', pitch: 1.3, rate: 1.05, slot: 1 } },
  corrow: { name: 'Corrow', color: '#dcb65e', voice: { gender: 'm', pitch: 0.66, rate: 0.9, slot: 2 } },
  pell: { name: 'Pell', color: '#a9d9a1', voice: { gender: 'm', pitch: 1.5, rate: 1.12, slot: 3 } },
  mira: { name: 'Mira', color: '#f39c6b', voice: { gender: 'f', pitch: 1.3, rate: 1.1, slot: 2 } },
  sauvir: { name: 'Sauvir', color: '#e5603f', voice: { gender: 'm', pitch: 0.74, rate: 0.86, slot: 4 } },
  ysolde: { name: 'Ysolde', color: '#e9c274', voice: { gender: 'f', pitch: 0.8, rate: 0.8, slot: 3 } },
  ysoldeYoung: { name: 'Reach Girl', color: '#e9c274', voice: { gender: 'f', pitch: 1.2, rate: 1.0, slot: 3 } },
  ama: { name: 'Ama Kesh', color: '#e0794f', voice: { gender: 'f', pitch: 0.82, rate: 0.95, slot: 4 } },
  varek: { name: 'Varek', color: '#b9bec8', voice: { gender: 'm', pitch: 0.82, rate: 0.95, slot: 5 } },
  orsk: { name: 'Orsk', color: '#f4f7ff', voice: { gender: 'm', pitch: 0.45, rate: 0.8, slot: 6 } },
  nell: { name: 'Nell', color: '#d4c39a', voice: { gender: 'f', pitch: 1.25, rate: 1.1, slot: 5 } },
  bryn: { name: 'Bryn', color: '#d4c39a', voice: { gender: 'f', pitch: 1.35, rate: 1.12, slot: 6 } },
  tam: { name: 'Tam', color: '#c5d49a', voice: { gender: 'm', pitch: 1.35, rate: 1.05, slot: 7 } },
  hob: { name: 'Hob', color: '#d4b48a', voice: { gender: 'm', pitch: 0.95, rate: 1.0, slot: 8 } },
  soldier: { name: 'Soldier', color: '#aab0ba', voice: { gender: 'm', pitch: 0.9, rate: 1.05, slot: 2 } },
  priest: { name: 'Wheel Priest', color: '#e6e0d2', voice: { gender: 'm', pitch: 1.0, rate: 0.9, slot: 3 } },
  reach: { name: 'Reach Warrior', color: '#e0794f', voice: { gender: 'm', pitch: 0.8, rate: 1.0, slot: 4 } },
  villager: { name: 'Villager', color: '#e9c274', voice: { gender: 'f', pitch: 1.1, rate: 1.0, slot: 4 } },
  narrator: { name: '', color: '#e8e2d4', voice: { gender: 'f', pitch: 0.95, rate: 0.9, slot: 1 } },
};

export interface Memory {
  id: string;
  title: string;
  text: string;
  perk: string;
  /** Some things the Wheel cannot take. */
  permanent?: boolean;
  sealed?: boolean;
}

export const MEMORIES: Memory[] = [
  { id: 'song', title: 'Four Notes', text: 'A song with no ending. You have hummed it in every body you have ever worn. It rises four times and then stops, as if waiting.', perk: 'Humming heals you.', permanent: true },
  { id: 'hands', title: "Maren's Hands", text: 'A narrow bed in the Cinder Steps. Scarred fingers twisting copper wire around a prayer-wheel. You cannot see her face any more. You can still see her hands.', perk: 'Humming heals 50% faster.' },
  { id: 'elias', title: 'Elias, Laughing', text: 'A thin boy with ink on his fingers, laughing so hard at something you said that he falls off a bench. You do not remember what you said.', perk: '+15% stamina.' },
  { id: 'stance', title: 'How to Stand', text: 'A big man with a cord of rings around his neck, kicking your back foot into place. "Weight forward. You always lead with the left."', perk: 'Parry window +20%.' },
  { id: 'bread', title: 'Bread and Smoke', text: 'A great stair full of hungry people. A crossbow in your hands. Then nothing, as if someone cut the page out.', perk: '+15% posture.' },
  { id: 'canal', title: 'A Canal of Lanterns', text: 'Red paper lanterns rising off black water. A small hand in yours. You have never been to Lantern Reach, as far as you know.', perk: 'Wrath fills 20% faster.' },
  { id: 'field', title: 'A Farmer\'s Field', text: 'Wheat taller than you, gold to the horizon. A scythe that swings like a sword. Somebody tied the last sheaf with red string.', perk: '+8% damage.' },
  { id: 'sky', title: 'The Sky Under You', text: 'Wind. A great gentle creature purring beneath you. "It is just like missing a stair," you told it, at the end.', perk: '+10% posture.' },
  { id: 'wall', title: 'Falling', text: 'Life forty-six. A wall at Kessel, a loose stone, a very undignified scream. Elias says you hit the ground before you finished swearing.', perk: '+10% stamina.' },
  { id: 'salt', title: 'The Taste of Salt', text: 'Cold water closing over your head. You have drowned at least twice. Your body still flinches at the sea.', perk: '+7% damage.' },
  { id: 'sealed', title: 'Sealed Pages', text: 'Four pages near the back of the book, tied with red ribbon and sealed in Elias\'s wax. He says they are nothing. The blade flickers when he says it.', perk: 'Unread.', permanent: true, sealed: true },
];

export const LOSABLE = MEMORIES.map((m, i) => (m.permanent ? -1 : i)).filter((i) => i >= 0);

export interface PerkTotals {
  humHeal: number;
  posture: number;
  stamina: number;
  damage: number;
  parry: number;
  wrathGain: number;
}

export function perksFrom(kept: boolean[]): PerkTotals {
  const p: PerkTotals = { humHeal: 1, posture: 1, stamina: 1, damage: 1, parry: 1, wrathGain: 1 };
  const has = (id: string) => {
    const i = MEMORIES.findIndex((m) => m.id === id);
    return i >= 0 && kept[i];
  };
  if (has('hands')) p.humHeal += 0.5;
  if (has('elias')) p.stamina += 0.15;
  if (has('stance')) p.parry += 0.2;
  if (has('bread')) p.posture += 0.15;
  if (has('canal')) p.wrathGain += 0.2;
  if (has('field')) p.damage += 0.08;
  if (has('sky')) p.posture += 0.1;
  if (has('wall')) p.stamina += 0.1;
  if (has('salt')) p.damage += 0.07;
  return p;
}
