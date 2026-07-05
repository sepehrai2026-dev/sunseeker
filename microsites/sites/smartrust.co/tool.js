function initTool(container) {
  container.innerHTML = `
    <h3>Estate planning calculator</h3>
    <div class="tool-row">
      <div>
        <label for="st-estate">Total estate value ($)</label>
        <input type="number" id="st-estate" placeholder="500000" value="500000">
      </div>
      <div>
        <label for="st-state">State</label>
        <select id="st-state">
          <option value="avg">Average (US)</option>
          <option value="ca">California</option>
          <option value="ny">New York</option>
          <option value="tx">Texas</option>
          <option value="fl">Florida</option>
          <option value="wa">Washington</option>
          <option value="ma">Massachusetts</option>
          <option value="or">Oregon</option>
        </select>
      </div>
    </div>
    <div class="tool-row">
      <div>
        <label for="st-type">Trust type</label>
        <select id="st-type">
          <option value="revocable">Revocable living trust</option>
          <option value="irrevocable">Irrevocable trust</option>
          <option value="special">Special needs trust</option>
          <option value="charitable">Charitable remainder trust</option>
        </select>
      </div>
      <div>
        <label for="st-beneficiaries">Number of beneficiaries</label>
        <input type="number" id="st-beneficiaries" value="2" min="1" max="20">
      </div>
    </div>
    <button id="st-calc">Calculate</button>
    <div id="st-result"></div>
  `;

  const probateRates = {
    avg: 0.04, ca: 0.05, ny: 0.045, tx: 0.035, fl: 0.03, wa: 0.04, ma: 0.04, or: 0.045
  };

  const stateEstateTax = {
    avg: 0, ca: 0, ny: 6110000, tx: 0, fl: 0, wa: 2193000, ma: 2000000, or: 1000000
  };

  const trustCosts = {
    revocable: { low: 1500, high: 3000, annual: 0 },
    irrevocable: { low: 3000, high: 7000, annual: 500 },
    special: { low: 3500, high: 8000, annual: 750 },
    charitable: { low: 5000, high: 10000, annual: 1000 }
  };

  document.getElementById('st-calc').addEventListener('click', () => {
    const estate = parseFloat(document.getElementById('st-estate').value) || 0;
    const state = document.getElementById('st-state').value;
    const type = document.getElementById('st-type').value;
    const bens = parseInt(document.getElementById('st-beneficiaries').value) || 1;

    const probateRate = probateRates[state];
    const probateCost = Math.round(estate * probateRate);
    const costs = trustCosts[type];
    const complexityAdd = Math.max(0, (bens - 2)) * 250;
    const trustLow = costs.low + complexityAdd;
    const trustHigh = costs.high + complexityAdd;
    const savings = probateCost - trustHigh;

    const stateThreshold = stateEstateTax[state];
    let taxNote = '';
    if (stateThreshold > 0 && estate > stateThreshold) {
      const taxableAmount = estate - stateThreshold;
      const estTax = Math.round(taxableAmount * 0.12);
      taxNote = `<br><strong style="color:var(--accent)">State estate tax alert:</strong> Your estate exceeds the ${state.toUpperCase()} threshold of $${stateThreshold.toLocaleString()}. Estimated state estate tax: <strong>$${estTax.toLocaleString()}</strong>. An irrevocable trust may help reduce this.`;
    }

    const fedThreshold = 13610000;
    let fedNote = '';
    if (estate > fedThreshold) {
      const fedTax = Math.round((estate - fedThreshold) * 0.40);
      fedNote = `<br><strong style="color:var(--accent)">Federal estate tax:</strong> Estate exceeds $${fedThreshold.toLocaleString()} exemption. Estimated federal tax: <strong>$${fedTax.toLocaleString()}</strong> (40% rate).`;
    }

    const typeDescriptions = {
      revocable: 'You keep full control and can modify or dissolve the trust at any time. Assets avoid probate but remain in your taxable estate.',
      irrevocable: 'Assets are removed from your taxable estate, providing tax benefits and creditor protection. Changes are difficult once established.',
      special: 'Designed to provide for a beneficiary with disabilities without disqualifying them from government benefits like SSI or Medicaid.',
      charitable: 'Provides income to you during your lifetime, then donates the remainder to charity. Offers immediate tax deductions and reduces estate size.'
    };

    document.getElementById('st-result').innerHTML = `
      <div class="tool-result">
        <strong>Estate planning estimate</strong>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:1rem 0">
          <div>
            <div style="font-size:0.8rem;color:var(--text-muted)">Probate cost (without trust)</div>
            <div style="font-size:1.25rem;font-weight:600;color:#dc2626">$${probateCost.toLocaleString()}</div>
          </div>
          <div>
            <div style="font-size:0.8rem;color:var(--text-muted)">Trust setup cost</div>
            <div style="font-size:1.25rem;font-weight:600;color:var(--accent)">$${trustLow.toLocaleString()} – $${trustHigh.toLocaleString()}</div>
          </div>
          <div>
            <div style="font-size:0.8rem;color:var(--text-muted)">Estimated savings</div>
            <div style="font-size:1.25rem;font-weight:600;color:#16a34a">${savings > 0 ? '$' + savings.toLocaleString() + '+' : 'Comparable cost'}</div>
          </div>
          <div>
            <div style="font-size:0.8rem;color:var(--text-muted)">Annual maintenance</div>
            <div style="font-size:1.25rem;font-weight:600">${costs.annual > 0 ? '$' + costs.annual.toLocaleString() + '/yr' : 'None'}</div>
          </div>
        </div>
        <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.5rem"><strong>${type.charAt(0).toUpperCase() + type.slice(1)} trust:</strong> ${typeDescriptions[type]}</p>
        ${taxNote}${fedNote}
        <p style="font-size:0.8rem;color:var(--text-muted);margin-top:1rem;border-top:1px solid var(--border);padding-top:0.75rem">These are rough estimates for educational purposes. Actual costs depend on attorney fees, estate complexity, and specific state laws. Consult a qualified estate planning attorney.</p>
      </div>
    `;
  });
}
