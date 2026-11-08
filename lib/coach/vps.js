// Publishing to a VPS: step-by-step instructions to buy a domain, set up a small server and
// install the funnel, with the costs budgeted. Based on "Setting up a VPS with TextToBr"
// (Text-to-Breasonings): a hosting account, a domain, a small VPS ($10 for 3 months there),
// SWI-Prolog installed, an ssh key so you needn't type the password, then the files uploaded
// to /var/www/<domain>/ and run with swipl. The providers and prices are yours to set.

export function newVps() {
  return {
    domainProvider: '', vpsProvider: '', domain: '', ip: '', user: 'root', sshPort: 22,
    costs: { domainPerYear: 0, vpsAmount: 10, vpsMonths: 3, setup: 0 },
    done: {}
  };
}

const r2 = (n) => Math.round(n * 100) / 100;

// What it costs: per month, per year, the first year (with any setup fee) and per day (for the
// running costs in the coach's figures).
export function vpsCosts(v) {
  const c = v.costs;
  const vpsMonthly = c.vpsMonths ? (Number(c.vpsAmount) || 0) / c.vpsMonths : 0;
  const domainMonthly = (Number(c.domainPerYear) || 0) / 12;
  const monthly = r2(vpsMonthly + domainMonthly);
  const yearly = r2(monthly * 12);
  return {
    monthly, yearly, firstYear: r2(yearly + (Number(c.setup) || 0)), perDay: Math.round((yearly / 365) * 10000) / 10000,
    how: {
      monthly: `$${c.vpsAmount} for the VPS every ${c.vpsMonths} month${c.vpsMonths === 1 ? '' : 's'} = $${r2(vpsMonthly)} a month, plus $${c.domainPerYear} a year for the domain = $${r2(domainMonthly)} a month`,
      yearly: `$${monthly} a month × 12`,
      firstYear: `$${yearly} a year + $${c.setup || 0} to set up`,
      perDay: `$${yearly} a year ÷ 365`
    }
  };
}

const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;

// The steps, filled in with your details as far as they are known.
export function vpsSteps(v) {
  const host = v.ip || v.domain || 'your.server';
  const target = `${v.user || 'root'}@${host}`;
  const port = Number(v.sshPort) || 22;
  const folder = `/var/www/${v.domain || 'yourdomain.com'}`;
  return [
    { id: 'account', title: 'Make an account with a hosting company', detail: v.domainProvider ? `At ${v.domainProvider}.` : 'Choose a company that sells domains and VPSs (or one for each) and enter it above.' },
    { id: 'domain', title: 'Buy a domain name', detail: `${v.domain ? `${v.domain}` : 'Your domain'}${v.costs.domainPerYear ? `, about $${v.costs.domainPerYear} a year` : ''}, in the hosting company's control panel.` },
    { id: 'vps', title: 'Rent a small VPS', detail: `${v.vpsProvider ? `At ${v.vpsProvider}, ` : ''}$${v.costs.vpsAmount} every ${v.costs.vpsMonths} month${v.costs.vpsMonths === 1 ? '' : 's'}${v.ip ? `; its address is ${v.ip}` : '; note its IP address'}. Debian or Ubuntu is simplest.` },
    { id: 'key', title: 'Sign in without typing the password each time', detail: 'Make an ssh key on this computer (once) and copy it to the server. Paste these into Terminal:',
      commands: ['ssh-keygen -t ed25519', `ssh-copy-id -p ${port} ${target}`] },
    { id: 'swipl', title: 'Install SWI-Prolog on the server', detail: 'Or ask the VPS company to install it for you.',
      commands: [`ssh -p ${port} ${target} ${q('apt-get update && apt-get install -y swi-prolog-nox')}`] },
    { id: 'dns', title: 'Point the domain at the server', detail: `In the domain's DNS settings, add an A record for ${v.domain || 'your domain'} (and www) to ${v.ip || 'the server\'s IP address'}. It can take a few hours to work everywhere.` },
    { id: 'folder', title: 'Make the folder for your sites', detail: `Your sites go in ${folder}, as in the TextToBr guide.`, commands: [`ssh -p ${port} ${target} ${q(`mkdir -p ${folder}`)}`] },
    { id: 'publish', title: 'Publish the funnel from Tabler', detail: `In Tabler's Publish tab, enter the address ${v.domain || host}, user ${v.user || 'root'}, ssh port ${port} and folder ${folder}, press Check (dry run), then Publish funnel.` },
    { id: 'test', title: 'Try it', detail: `Open http://${v.domain || host}:8097/ (the funnel's port) on your phone and go through it once; the visit should appear in the coach's figures.` }
  ];
}

export const vpsProgress = (v) => { const steps = vpsSteps(v); const done = steps.filter((s) => v.done?.[s.id]).length; return { done, total: steps.length }; };
