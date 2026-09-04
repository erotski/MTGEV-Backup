import { BoosterEVRecord, BoxArbitrageRecord, ChaseCard, SetOption } from './types';
import { CURATED_CHASE_CARDS } from './services/chaseCardsService';

export const INITIAL_SETS: SetOption[] = [];

export const CHASE_CARDS_BY_SET: Record<string, ChaseCard[]> = { ...CURATED_CHASE_CARDS };

export const INITIAL_BOOSTER_EV_DATA: Record<string, BoosterEVRecord[]> = {};

export const INITIAL_BOX_ARBITRAGE: BoxArbitrageRecord[] = [];
