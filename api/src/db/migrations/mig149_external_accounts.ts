import type {Pool} from 'pg';
import {externalAccountsSchema} from '../../community/external-accounts.js';
export async function mig149_external_accounts(pool:Pool){await externalAccountsSchema(pool);}
