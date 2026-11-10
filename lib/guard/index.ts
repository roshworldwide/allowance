// ALLOWANCE guard — pure TypeScript, no framework imports, extractable as a package.
export * from './types';
export { createGuard, aggregate, summarize, type Guard, type GuardDeps, type EvaluateInput } from './evaluate';
export { ALL_RULES, RULES, RULE_BY_ID, type Rule, type RuleContext, type LedgerFacts } from './rules';
export { MemoryLedger, computeFacts, LedgerTransitionError, type Ledger, type LedgerTx, type LedgerEntry, type LedgerStatus } from './ledger';
export { canonicalJson, nextEvent, appendEvent, verifyChain, hashEvent, preimage, MemoryChainStore, GENESIS_HASH, type ChainEvent, type ChainStore, type ChainVerification } from './chain';
export { contractDraftSchema, contractFromDraft, confirmContract, resolveLine, type Vocabulary, type ContractDraft } from './contract';
export { wrap, classifyTool, toIntent, normaliseTool, argsHash, ALLOWANCE_CHECKOUT, type ToolCall, type ToolOutcome, type WrapSession, type AnyTool, type ResponsesTool, type ToolClass } from './wrap';
export { mandatePreset, type MandatePreset } from './policy';
