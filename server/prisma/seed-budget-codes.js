/**
 * Loads the NTEMS cost codes: expense types and categories (E), product types and
 * categories (P) and project types (J). Safe to run again: rows are matched by code.
 * Run with: node prisma/seed-budget-codes.js
 *
 * `applies` on an expense type lists the cost objects that may use it (PROJECT, PRODUCT,
 * OVERHEAD); it is enforced when an expense is entered and when a budget line is added.
 * Today's categories are left untouched; they are re-pointed once the mapping is confirmed.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const EXPENSE = [
  ['E100', 'General Administration', 'PROJECT,OVERHEAD', [
    ['E101', 'Stationery and Office Supplies'], ['E102', 'Courier, Postage'], ['E103', 'Printing, Photocopying'],
    ['E104', 'Office Equipment Hire'], ['E105', 'Business Travel not allocated to Projects'], ['E106', 'Staff Refreshments and Meetings'],
    ['E107', 'Customer Visit Entertainment'], ['E108', 'Memberships and Subscriptions'], ['E109', 'Miscellaneous Approved Expenses']]],
  ['E200', 'Materials, Components, and Production', 'PROJECT,PRODUCT,OVERHEAD', [
    ['E201', 'Mechanical Components, Frames and Fabricated Parts'], ['E202', 'Motors'], ['E203', 'Gearboxes'], ['E204', 'Drives and Servo Systems'],
    ['E205', 'PLCs'], ['E206', 'Sensors'], ['E207', 'Actuators'], ['E208', 'Wiring'], ['E209', 'Electronic Components'],
    ['E210', 'Raw Materials and Consumables'], ['E211', 'Tools, Jigs and Fixtures'], ['E212', 'Laser Cutting Charges'], ['E213', 'Machining Charges'],
    ['E214', 'Fabrication and Assembly'], ['E215', 'Packaging and Dispatch Materials'], ['E216', 'Freight, Customs, and Inward Transportation'],
    ['E217', 'Production Scrap and Material Wastage']]],
  ['E300', 'Project Execution and Customer Delivery', 'PROJECT,PRODUCT', [
    ['E301', 'Site Installation and Commissioning'], ['E302', 'Project-Specific Subcontractors'], ['E303', 'Customer-Site Travel, Accommodation, Meals'],
    ['E304', 'Testing, Calibration, and Inspection'], ['E305', 'Site Equipment Rental'], ['E306', 'Project-Specific Software or Licences'],
    ['E307', 'Shipping, Logistics, and Project Insurance'], ['E350', 'Warranty Repairs and Customer Support']]],
  ['E400', 'R&D', 'PROJECT,PRODUCT,OVERHEAD', [
    ['E401', 'Prototype Deployment and Testing'], ['E402', 'CAD, GIS, Simulation and Digital-Twin Development'], ['E403', 'Robotics Software and Firmware Development'],
    ['E404', 'R&D Materials and Components'], ['E405', 'External Engineering and Design Services'], ['E406', 'Certification and Compliance Testing'],
    ['E407', 'Patent and IP'], ['E408', 'Research Collaborations and Technical Trials']]],
  ['E500', 'Facilities', 'OVERHEAD', [
    ['E501', 'Factory Rent'], ['E502', 'Office Rent'], ['E503', 'Electricity'], ['E504', 'Water'], ['E505', 'Utilities'],
    ['E506', 'Repairs and Maintenance'], ['E507', 'Security'], ['E508', 'Housekeeping'], ['E509', 'Waste Disposal']]],
  ['E600', 'IT & Software', 'PROJECT,OVERHEAD', [
    ['E601', 'Cloud Hosting'], ['E602', 'Cloud Storage'], ['E603', 'CAD, GIS, Engineering, Simulation Licences'],
    ['E604', 'Accounting, Payroll, and Office Software'], ['E605', 'Cybersecurity, Backup, IT Support'],
    ['E606', 'Computers, Peripherals and Accessories'], ['E607', 'Website, Domain, and Email Hosting'], ['E608', 'Mobile and Internet Services']]],
  ['E700', 'Sales, Marketing, and Business Development', 'PRODUCT,OVERHEAD', [
    ['E701', 'Digital Marketing'], ['E702', 'Trade Shows and Events'], ['E703', 'Sales Travel'], ['E704', 'Brochures and Collateral'], ['E705', 'Agent Commissions']]],
  ['E800', 'Professional, Legal, and Compliance Costs', 'PRODUCT,OVERHEAD', [
    ['E801', 'Accounting and Bookkeeping'], ['E802', 'Company Secretarial Services'], ['E803', 'Legal'], ['E804', 'Auditor'], ['E805', 'GST'],
    ['E806', 'ISO Certification'], ['E807', 'Factory Licences and Registrations']]],
  ['E900', 'Banking, Finance and Insurance', 'OVERHEAD', [
    ['E901', 'Bank Charges'], ['E902', 'Loan Interest'], ['E903', 'General Insurance Premiums'], ['E904', 'Foreign-Exchange Charges']]],
  ['E1000', 'Employee Personnel Cost', 'OVERHEAD', [
    ['E1001', 'Salaries'], ['E1002', 'PF'], ['E1003', 'Employee Insurance'], ['E1004', 'Computers and Other Equipments'], ['E1005', 'Personal Protection']]],
];


const PRODUCTS = [
  ['P100', 'Industrial Robots', [['P101', 'Robotic Arm'], ['P102', 'SCARA Robot'], ['P103', 'Gantry Robot'], ['P104', 'Welding Robot']]],
  ['P200', 'PLCs and Motion Controllers', [
    ['P201', 'RASi4 - 4 Channels mini'], ['P202', 'RASi4 - 8 Channels PLC'], ['P203', 'RASi4 - Motion Controller'],
    ['P204', 'Digital Input Card - 8 Channels'], ['P205', 'Digital Output Card - 8 Channels'], ['P206', 'Analogue Input Card - 8 Channels Voltage'],
    ['P207', 'Analogue Output Card - 8 Channels Voltage'], ['P208', 'Analogue Input Card - 8 Channels Current'], ['P209', 'Analogue Output Card - 8 Channels Current']]],
  ['P300', 'Robotic Accessories and Tooling', [['P301', 'End Effector'], ['P302', 'Gripper'], ['P303', 'Jigs and Fixtures'], ['P304', 'Safety Fencing']]],
];

const PROJECTS = [
  ['J100', 'Bespoke Robots'], ['J110', 'Industrial Automation'], ['J120', 'Digital Twin Implementation'], ['J130', 'CAD/GIS Engineering Services'],
  ['J140', 'Simulation Software Development'], ['J150', 'Installation and Commissioning'], ['J160', 'Maintenance and Support'],
  ['J170', 'Defence Aerospace'], ['J180', 'Proof of Concept'], ['J190', 'Consultancy and Engineering Services'], ['J200', 'Internal Capital Projects'],
];

async function loadCategoryTypes(kind, list) {
  let types = 0; let cats = 0;
  for (const [code, name, applies, children] of list) {
    let type = await prisma.categoryType.findFirst({ where: { kind, OR: [{ code }, { name: { equals: name, mode: 'insensitive' } }] } });
    if (type) {
      type = await prisma.categoryType.update({ where: { id: type.id }, data: { code, name, appliesTo: applies, isActive: true } });
    } else {
      type = await prisma.categoryType.create({ data: { kind, code, name, appliesTo: applies } });
      types++;
    }
    for (const [ccode, cname] of children) {
      const hit = await prisma.category.findFirst({ where: { type: kind, typeId: type.id, OR: [{ code: ccode }, { name: { equals: cname, mode: 'insensitive' } }] } });
      if (hit) {
        await prisma.category.update({ where: { id: hit.id }, data: { code: ccode, name: cname, isActive: true } });
      } else {
        await prisma.category.create({ data: { type: kind, typeId: type.id, code: ccode, name: cname, icon: 'tag', isCustom: true } });
        cats++;
      }
    }
  }
  return { types, cats };
}

async function main() {
  const e = await loadCategoryTypes('expense', EXPENSE);

  let pt = 0; let pc = 0;
  for (const [code, name, children] of PRODUCTS) {
    let type = await prisma.productType.findFirst({ where: { OR: [{ code }, { name: { equals: name, mode: 'insensitive' } }] } });
    if (type) type = await prisma.productType.update({ where: { id: type.id }, data: { code, name, isActive: true } });
    else { type = await prisma.productType.create({ data: { code, name } }); pt++; }
    for (const [ccode, cname] of children) {
      const hit = await prisma.productCategory.findFirst({ where: { typeId: type.id, OR: [{ code: ccode }, { name: { equals: cname, mode: 'insensitive' } }] } });
      if (hit) await prisma.productCategory.update({ where: { id: hit.id }, data: { code: ccode, name: cname, isActive: true } });
      else { await prisma.productCategory.create({ data: { typeId: type.id, code: ccode, name: cname } }); pc++; }
    }
  }

  let jt = 0;
  for (const [code, name] of PROJECTS) {
    const hit = await prisma.projectType.findFirst({ where: { OR: [{ code }, { name: { equals: name, mode: 'insensitive' } }] } });
    if (hit) await prisma.projectType.update({ where: { id: hit.id }, data: { code, name, isActive: true } });
    else { await prisma.projectType.create({ data: { code, name } }); jt++; }
  }

  console.log(`Expense: ${e.types} types, ${e.cats} categories added`);
  console.log(`Products: ${pt} types, ${pc} categories added`);
  console.log(`Projects: ${jt} types added`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
