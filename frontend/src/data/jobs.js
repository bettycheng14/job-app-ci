export const JOBS = [
  { id: '1', title: 'Frontend Developer', company: 'TechCorp', location: 'Remote', type: 'Full-time', salary: '$80k – $120k', tags: ['React', 'TypeScript', 'CSS'] },
  { id: '2', title: 'Backend Engineer', company: 'DataSystems', location: 'New York', type: 'Full-time', salary: '$90k – $130k', tags: ['Node.js', 'MongoDB', 'Docker'] },
  { id: '3', title: 'DevOps Engineer', company: 'CloudBase', location: 'San Francisco', type: 'Full-time', salary: '$100k – $140k', tags: ['GKE', 'Terraform', 'CI/CD'] },
  { id: '4', title: 'UI/UX Designer', company: 'CreativeStudio', location: 'Remote', type: 'Contract', salary: '$70k – $100k', tags: ['Figma', 'Prototyping', 'Research'] },
  { id: '5', title: 'Data Scientist', company: 'AnalyticsCo', location: 'Boston', type: 'Full-time', salary: '$95k – $135k', tags: ['Python', 'ML', 'SQL'] },
  { id: '6', title: 'Product Manager', company: 'StartupXYZ', location: 'Austin', type: 'Full-time', salary: '$85k – $125k', tags: ['Agile', 'Roadmapping', 'Analytics'] },
];

export const JOBS_MAP = Object.fromEntries(JOBS.map((j) => [j.id, j]));
