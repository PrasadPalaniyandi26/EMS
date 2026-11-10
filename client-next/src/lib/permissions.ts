// What each role may do in Budget and Costing. Mirrors @Roles() on the API, which stays the source of truth.
//   Finance and Admin  approve money (plans, changes, baselines, standard cost, rates, price, close) and can do everything below.
//   Operations         prepares plans, estimates, build plans and build orders, and proposes what Finance approves.
//   Configurator       keeps the setup data: parts, categories, operation types, product BOMs and operations.
type RoleLike = string | null | undefined;

const up = (r: RoleLike) => (r || '').toUpperCase();

export const isFinanceRole = (r: RoleLike) => ['ADMIN', 'FINANCE'].includes(up(r));
export const isOperationsRole = (r: RoleLike) => up(r) === 'OPERATIONS';
export const isConfiguratorRole = (r: RoleLike) => up(r) === 'CONFIGURATOR';

// Parts, part categories, operation types, product BOM lines and product operations
export const canConfigure = (r: RoleLike) => isFinanceRole(r) || isConfiguratorRole(r);

// Plans, build orders, standard cost proposals and baseline proposals
export const canPropose = (r: RoleLike) => isFinanceRole(r) || isOperationsRole(r);

// Job BOMs: Configurator and Operations both work on them
export const canEditJobBom = (r: RoleLike) => canConfigure(r) || isOperationsRole(r) || up(r) === 'MANAGER';
