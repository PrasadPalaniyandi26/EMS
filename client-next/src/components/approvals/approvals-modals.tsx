'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  CheckCircle2,
  XCircle,
  X,
  MessageSquare,
  BellRing,
  Settings,
  UserSearch,
  AlertTriangle,
  FileText,
  PauseCircle,
  History,
  ShieldCheck,
  CornerUpLeft,
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: any) => void;
  selectedRequest?: any;
}

export function ApproveModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  const [comment, setComment] = React.useState('');
  const [notify, setNotify] = React.useState(true);

  if (!selectedRequest) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[540px] p-0 overflow-hidden bg-sharp-white border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)]">
        <DialogHeader className="px-6 py-5 border-b border-casper/30 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center border border-green-200">
              <ShieldCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-bold text-charcoal tracking-tight">Approve Expense Request</DialogTitle>
              <DialogDescription className="text-[11px] text-juniper font-semibold uppercase tracking-wider">Final Authorization Required</DialogDescription>
            </div>
          </div>
          <button onClick={onClose} className="text-casper hover:text-charcoal transition-colors">
            <X size={20} />
          </button>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="rounded-lg border border-casper/40 bg-white/50 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-mystic/40 border-b border-casper/40 text-juniper font-bold uppercase tracking-tighter">
                <tr>
                  <th className="px-4 py-2 text-left">Code</th>
                  <th className="px-4 py-2 text-left">Employee</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-casper/20">
                  <td className="px-4 py-3 font-bold text-charcoal">{selectedRequest.code || `#${selectedRequest.id}`}</td>
                  <td className="px-4 py-3 font-medium text-charcoal">{selectedRequest.submitted_by_name || 'Alex Thompson'}</td>
                  <td className="px-4 py-3 text-right font-bold text-charcoal">{formatCurrency(selectedRequest.amount, 'INR')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-juniper uppercase tracking-widest flex items-center gap-2">
              <MessageSquare size={14} /> Approval Comments (Optional)
            </label>
            <Textarea 
              className="w-full h-24 p-3 bg-white border border-casper/60 rounded-lg text-[13px] placeholder:text-casper focus:ring-1 focus:ring-juniper focus:border-juniper resize-none" 
              placeholder="Enter any notes or justification for this approval..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between bg-mystic/20 p-4 rounded-xl border border-casper/30">
            <div className="flex items-center gap-3">
              <BellRing className="text-juniper" size={20} />
              <div>
                <p className="text-[12px] font-bold text-charcoal">Notify Employee upon Approval</p>
                <p className="text-[10px] text-juniper/70 font-medium">Automatic email will be sent to {selectedRequest.submitted_by_name || 'Alex Thompson'}</p>
              </div>
            </div>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </div>
        </div>

        <div className="px-6 py-5 bg-mystic/30 border-t border-casper/30 flex items-center justify-end gap-3 font-sans">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-transparent text-[12px] font-bold text-juniper uppercase tracking-widest hover:bg-white/50 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm({ comment, notify })}
            className="px-8 py-2.5 bg-juniper text-pure-white text-[12px] font-bold uppercase tracking-widest rounded-lg shadow-lg shadow-juniper/20 hover:brightness-110 active:scale-95 transition-all"
          >
            Confirm Approval
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RejectModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  const [comment, setComment] = React.useState('');

  if (!selectedRequest) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[540px] p-0 overflow-hidden bg-sharp-white border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)]">
        <DialogHeader className="px-6 py-5 border-b border-casper/30 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center border border-rose-200">
              <XCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-bold text-charcoal tracking-tight">Reject Expense Request</DialogTitle>
              <DialogDescription className="text-[11px] text-rose-600 font-semibold uppercase tracking-wider">Reason for Rejection Required</DialogDescription>
            </div>
          </div>
          <button onClick={onClose} className="text-casper hover:text-charcoal transition-colors">
            <X size={20} />
          </button>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="rounded-lg border border-casper/40 bg-white/50 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-mystic/40 border-b border-casper/40 text-juniper font-bold uppercase tracking-tighter">
                <tr>
                  <th className="px-4 py-2 text-left">Code</th>
                  <th className="px-4 py-2 text-left">Employee</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-casper/20">
                  <td className="px-4 py-3 font-bold text-charcoal">{selectedRequest.code || `#${selectedRequest.id}`}</td>
                  <td className="px-4 py-3 font-medium text-charcoal">{selectedRequest.submitted_by_name || 'Alex Thompson'}</td>
                  <td className="px-4 py-3 text-right font-bold text-charcoal">{formatCurrency(selectedRequest.amount, 'INR')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-juniper uppercase tracking-widest flex items-center gap-2">
              <MessageSquare size={14} /> Rejection Reason
            </label>
            <Textarea 
              className="w-full h-24 p-3 bg-white border border-casper/60 rounded-lg text-[13px] placeholder:text-casper focus:ring-1 focus:ring-rose-500 focus:border-rose-500 resize-none" 
              placeholder="Provide a detailed reason for rejecting this request..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        </div>

        <div className="px-6 py-5 bg-rose-50/30 border-t border-rose-100 flex items-center justify-end gap-3 font-sans">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 bg-transparent text-[12px] font-bold text-juniper uppercase tracking-widest hover:bg-white/50 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={() => onConfirm({ comment })}
            className="px-8 py-2.5 bg-rose-600 text-pure-white text-[12px] font-bold uppercase tracking-widest rounded-lg shadow-lg shadow-rose-600/20 hover:brightness-110 active:scale-95 transition-all"
          >
            Confirm Rejection
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SendBackModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  const [comment, setComment] = React.useState('');

  if (!selectedRequest) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[540px] p-0 overflow-hidden bg-sharp-white border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)]">
        <DialogHeader className="px-6 py-5 border-b border-casper/30 flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center border border-blue-200">
              <CornerUpLeft className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-bold text-charcoal tracking-tight">Send Back to Employee</DialogTitle>
              <DialogDescription className="text-[11px] text-blue-600 font-semibold uppercase tracking-wider">Return for Revision</DialogDescription>
            </div>
          </div>
          <button onClick={onClose} className="text-casper hover:text-charcoal transition-colors">
            <X size={20} />
          </button>
        </DialogHeader>

        <div className="p-6 space-y-6">
          <div className="rounded-lg border border-casper/40 bg-white/50 overflow-hidden">
            <table className="w-full text-[12px]">
              <thead className="bg-mystic/40 border-b border-casper/40 text-juniper font-bold uppercase tracking-tighter">
                <tr>
                  <th className="px-4 py-2 text-left">Code</th>
                  <th className="px-4 py-2 text-left">Employee</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-casper/20">
                  <td className="px-4 py-3 font-bold text-charcoal">{selectedRequest.code || `#${selectedRequest.id}`}</td>
                  <td className="px-4 py-3 font-medium text-charcoal">{selectedRequest.submitted_by_name || '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-charcoal">{formatCurrency(selectedRequest.amount, 'INR')}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-juniper uppercase tracking-widest flex items-center gap-2">
              <MessageSquare size={14} /> Reason for Sending Back
            </label>
            <Textarea
              className="w-full h-24 p-3 bg-white border border-casper/60 rounded-lg text-[13px] placeholder:text-casper focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="Explain what the employee needs to correct or provide..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-700 font-medium">
            The expense will return to <strong>DRAFT</strong> status and the employee can edit and resubmit it.
          </div>
        </div>

        <div className="px-6 py-5 bg-mystic/30 border-t border-casper/30 flex items-center justify-end gap-3 font-sans">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-transparent text-[12px] font-bold text-juniper uppercase tracking-widest hover:bg-white/50 rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ comment })}
            className="px-8 py-2.5 bg-blue-600 text-pure-white text-[12px] font-bold uppercase tracking-widest rounded-lg shadow-lg shadow-blue-600/20 hover:brightness-110 active:scale-95 transition-all"
          >
            Send Back
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MoreActionsModal({ isOpen, onClose, onConfirm, selectedRequest }: ModalProps) {
  if (!selectedRequest) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[576px] p-0 overflow-hidden bg-sharp-white border-none shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] animate-in fade-in zoom-in duration-300">
        <DialogHeader className="px-8 py-6 flex-row items-center justify-between border-b border-casper/20 space-y-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-juniper/10 flex items-center justify-center text-juniper">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-bold text-charcoal tracking-tight">Additional Approval Actions</DialogTitle>
              <DialogDescription className="text-[11px] text-juniper/70 font-medium uppercase tracking-wider">
                Request: {selectedRequest.code || `#${selectedRequest.id}`} • {selectedRequest.submitted_by_name || 'Alex Thompson'}
              </DialogDescription>
            </div>
          </div>
          <button onClick={onClose} className="text-casper hover:text-juniper transition-colors">
            <X size={20} />
          </button>
        </DialogHeader>

        <div className="p-8 grid grid-cols-2 gap-4">
          <div className="col-span-2 group">
            <label className="block text-[10px] font-bold text-juniper uppercase tracking-[0.1em] mb-3">Reassign Approver</label>
            <div className="relative">
              <UserSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-500 w-5 h-5" />
              <Select>
                <SelectTrigger className="w-full pl-12 pr-4 py-3.5 h-12 bg-white border border-casper/40 rounded-xl text-[13px] font-medium text-charcoal focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all appearance-none cursor-pointer">
                  <SelectValue placeholder="Pick a new manager..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="marcus">Marcus Aurelius (Director)</SelectItem>
                  <SelectItem value="jane">Jane Doe (VP Finance)</SelectItem>
                  <SelectItem value="robert">Robert Chen (Department Lead)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {[
            { id: 'flag', title: 'Flag for Audit', desc: 'Notify compliance team for high-priority review.', icon: AlertTriangle, color: 'yellow' },
            { id: 'docs', title: 'Request Docs', desc: 'Notify employee to upload additional receipts.', icon: FileText, color: 'cyan' },
            { id: 'hold', title: 'Hold for Review', desc: 'Pause this request in the current queue.', icon: PauseCircle, color: 'amber' },
            { id: 'history', title: 'Action History', desc: 'View full audit log of all manual modifications.', icon: History, color: 'juniper' },
          ].map((action) => (
            <button 
              key={action.id}
              onClick={() => onConfirm(action.id)}
              className="flex items-start gap-4 p-5 bg-white border border-casper/40 rounded-xl hover:border-juniper/50 hover:bg-mystic/30 transition-all text-left group"
            >
              <div className={`w-12 h-12 rounded-xl bg-${action.color}-100 flex items-center justify-center text-${action.color}-600 shrink-0 group-hover:scale-110 transition-transform ${action.color === 'juniper' ? 'bg-mystic text-juniper' : ''}`}>
                <action.icon className="w-7 h-7" />
              </div>
              <div>
                <p className="text-[13px] font-bold text-charcoal mb-1">{action.title}</p>
                <p className="text-[11px] text-charcoal/60 leading-tight">{action.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="px-8 py-6 bg-mystic/20 border-t border-casper/20 flex justify-end">
          <button 
            onClick={onClose}
            className="px-8 py-3 rounded-xl text-[12px] font-bold uppercase tracking-widest text-juniper hover:bg-white transition-all border border-transparent hover:border-casper/50"
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
