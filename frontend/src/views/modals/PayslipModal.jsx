import React, { useEffect } from 'react';
import { X, DollarSign, Download, Printer } from '../../components/Icons';

export function PayslipModal({ isOpen, onClose, slip, onDownloadPdf }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !slip) return null;

  const lineItems = Array.isArray(slip.lineItems) ? slip.lineItems : [];

  const earnings = Array.isArray(slip.earningsBreakdown)
    ? slip.earningsBreakdown
    : typeof slip.earningsBreakdown === 'string'
    ? JSON.parse(slip.earningsBreakdown || '[]')
    : lineItems.filter((li) => li.category?.startsWith('EARNING') || li.category?.startsWith('BENEFIT'));

  const deductions = Array.isArray(slip.deductionsBreakdown)
    ? slip.deductionsBreakdown
    : typeof slip.deductionsBreakdown === 'string'
    ? JSON.parse(slip.deductionsBreakdown || '[]')
    : lineItems.filter((li) => li.category?.startsWith('DEDUCTION'));

  const employerContribs = Array.isArray(slip.employerContributionsBreakdown)
    ? slip.employerContributionsBreakdown
    : typeof slip.employerContributionsBreakdown === 'string'
    ? JSON.parse(slip.employerContributionsBreakdown || '[]')
    : lineItems.filter((li) => li.category?.startsWith('CONTRIBUTION'));

  const fmt = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
      className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#4271b8] text-white flex items-center justify-center font-bold">
              <DollarSign size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm">Employee Payslip Statement</h3>
              <p className="text-[11px] text-slate-400">
                Ndakala Advisory LLP • 246 Owashika Road, Lavington, Nairobi
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* Payslip Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-800">
          {/* Employee & Period Summary Header */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
            <div>
              <span className="text-slate-400 block font-semibold uppercase text-[10px]">Employee</span>
              <span className="font-bold text-slate-900 text-xs">
                {slip.employee ? `${slip.employee.firstName} ${slip.employee.lastName}` : slip.employeeName || 'Staff Member'}
              </span>
              <span className="text-slate-500 block font-mono">{slip.employee?.employeeNumber || slip.employeeRef || slip.slipNumber || 'NDA-STAFF'}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase text-[10px]">Pay Period</span>
              <span className="font-bold text-slate-800">
                {slip.period?.name || slip.run?.period?.name || slip.payrollRun?.period?.name || 'Monthly Payroll'}
              </span>
              <span className="text-slate-500 block">Currency: KES</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase text-[10px]">Taxable Pay</span>
              <span className="font-mono font-bold text-slate-800">KES {fmt(slip.taxablePay)}</span>
              <span className="text-slate-500 block">Personal Relief: 2,400</span>
            </div>
            <div>
              <span className="text-slate-400 block font-semibold uppercase text-[10px]">Status</span>
              <span className="font-bold text-emerald-700 block">{slip.run?.status || 'PROCESSED'}</span>
              <span className="text-slate-500 block">Bank EFT</span>
            </div>
          </div>

          {/* Earnings & Deductions Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Earnings Section */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 font-bold text-xs text-slate-900 flex justify-between">
                <span>Earnings & Allowances</span>
                <span className="text-emerald-700 font-mono">KES {fmt(slip.grossPay)}</span>
              </div>
              <table className="w-full text-left">
                <tbody className="divide-y divide-slate-100 text-xs">
                  {earnings.map((e, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 text-slate-700 font-medium">{e.name || e.componentName || e.componentCode}</td>
                      <td className="p-2.5 text-right font-mono font-semibold text-slate-900">
                        {fmt(e.amount)}
                      </td>
                    </tr>
                  ))}
                  {earnings.length === 0 && (
                    <tr>
                      <td className="p-2.5 text-slate-700 font-medium">Basic Salary & Allowances</td>
                      <td className="p-2.5 text-right font-mono font-semibold text-slate-900">{fmt(slip.grossPay)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Statutory & Voluntary Deductions */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 font-bold text-xs text-slate-900 flex justify-between">
                <span>Statutory & Other Deductions</span>
                <span className="text-rose-700 font-mono">
                  -KES {fmt(slip.totalEmployeeDeductions ?? slip.totalDeductions ?? deductions.reduce((s, d) => s + Number(d.amount || 0), 0))}
                </span>
              </div>
              <table className="w-full text-left">
                <tbody className="divide-y divide-slate-100 text-xs">
                  {deductions.map((d, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 text-slate-700 font-medium">{d.name || d.componentName || d.componentCode}</td>
                      <td className="p-2.5 text-right font-mono font-semibold text-rose-700">
                        -{fmt(d.amount)}
                      </td>
                    </tr>
                  ))}
                  {deductions.length === 0 && (
                    <>
                      {slip.payeTax !== undefined && (
                        <tr>
                          <td className="p-2.5 text-slate-700">PAYE Income Tax</td>
                          <td className="p-2.5 text-right font-mono text-rose-700">-{fmt(slip.payeTax)}</td>
                        </tr>
                      )}
                      {slip.nssfEmployee !== undefined && (
                        <tr>
                          <td className="p-2.5 text-slate-700">NSSF (Tier I & II)</td>
                          <td className="p-2.5 text-right font-mono text-rose-700">-{fmt(slip.nssfEmployee)}</td>
                        </tr>
                      )}
                      {slip.shifDeduction !== undefined && (
                        <tr>
                          <td className="p-2.5 text-slate-700">SHIF (2.75%)</td>
                          <td className="p-2.5 text-right font-mono text-rose-700">-{fmt(slip.shifDeduction)}</td>
                        </tr>
                      )}
                      {slip.housingLevyEmployee !== undefined && (
                        <tr>
                          <td className="p-2.5 text-slate-700">Housing Levy (1.5%)</td>
                          <td className="p-2.5 text-right font-mono text-rose-700">-{fmt(slip.housingLevyEmployee)}</td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Employer Contributions */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-bold text-xs text-slate-900 flex justify-between items-center">
              <span>Employer Statutory Contributions (NSSF & Housing Levy Match)</span>
              <span className="text-slate-600 font-mono text-[11px]">
                Total Employer Cost: KES {fmt(slip.totalEmployerCosts ?? slip.totalEmployerCost ?? Number(slip.grossPay || 0) + Number(slip.employerContributionsTotal || 0))}
              </span>
            </div>
            {employerContribs.length > 0 && (
              <div className="p-3 bg-slate-50/30 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {employerContribs.map((ec, idx) => (
                  <div key={idx} className="p-2 bg-white rounded border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-semibold">{ec.name || ec.componentName || ec.componentCode}</span>
                    <span className="font-mono font-bold text-slate-800">KES {fmt(ec.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Net Pay Callout */}
          <div className="p-5 bg-slate-900 rounded-xl text-white flex justify-between items-center shadow-md">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">
                Net Take-Home Pay
              </span>
              <span className="text-2xl font-black tracking-tight text-white font-mono mt-0.5 block">
                KES {fmt(slip.netPay)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
              >
                <Printer size={14} />
                <span>Print</span>
              </button>
              {onDownloadPdf && slip.id && (
                <button
                  type="button"
                  onClick={() => onDownloadPdf(slip.id)}
                  className="px-3.5 py-1.5 bg-[#4271b8] hover:bg-[#335994] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Download size={14} />
                  <span>Export Payslip</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default PayslipModal;
