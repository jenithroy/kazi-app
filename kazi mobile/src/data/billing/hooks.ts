import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { notify } from '@/data/notifications/notify';

import { billingKeys } from './keys';
import * as api from './api';
import type { Challan, ChallanStatus, Invoice, OpenChallan, Payment, Quotation, QuotationStatus } from './types';

export function useInvoices() {
  return useQuery({ queryKey: billingKeys.invoices(), queryFn: api.fetchInvoices });
}

export function useAddInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoice: Invoice) => api.addInvoice(invoice),
    onMutate: async (invoice) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.invoices() });
      queryClient.setQueryData<Invoice[]>(billingKeys.invoices(), (old) => [invoice, ...(old ?? [])]);
    },
    // Re-read: the number drawn before the write can be renumbered by the
    // date-order pass that follows it, and a rejected create has to disappear.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
    },
    onSuccess: (_data, invoice) => {
      notify({ eventType: 'invoice.created', section: 'billing', targetRef: invoice.ref });
      if (invoice.explicitStatus === 'Sent') {
        notify({ eventType: 'invoice.sent', section: 'billing', targetRef: invoice.ref });
      }
    },
  });
}

interface InvoiceContext {
  previous?: Invoice[];
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; updates: Partial<Invoice> }, InvoiceContext>({
    mutationFn: ({ id, updates }) => api.updateInvoice(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.invoices() });
      const previous = queryClient.getQueryData<Invoice[]>(billingKeys.invoices());
      queryClient.setQueryData<Invoice[]>(billingKeys.invoices(), (old) =>
        (old ?? []).map((v) => (v.id === id ? { ...v, ...updates } : v)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(billingKeys.invoices(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
    },
    onSuccess: (_data, { id, updates }) => {
      const inv = queryClient.getQueryData<Invoice[]>(billingKeys.invoices())?.find((v) => v.id === id);
      const ref = inv?.ref;
      if (updates.explicitStatus === 'Sent') notify({ eventType: 'invoice.sent', section: 'billing', targetRef: ref });
      if (updates.cancelled === true) notify({ eventType: 'invoice.cancelled', section: 'billing', targetRef: ref });
    },
  });
}

type PaymentContext = InvoiceContext;

export function useAddPayment() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { invoiceId: string; payment: Payment }, PaymentContext>({
    mutationFn: ({ invoiceId, payment }) => api.addPayment(invoiceId, payment),
    onMutate: async ({ invoiceId, payment }) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.invoices() });
      const previous = queryClient.getQueryData<Invoice[]>(billingKeys.invoices());
      queryClient.setQueryData<Invoice[]>(billingKeys.invoices(), (old) =>
        (old ?? []).map((v) => (v.id === invoiceId ? { ...v, payments: [...v.payments, payment] } : v)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(billingKeys.invoices(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.invoices() });
    },
    onSuccess: (_data, { invoiceId }, context) => {
      const inv = context?.previous?.find((v) => v.id === invoiceId);
      notify({ eventType: 'invoice.paid', section: 'billing', targetRef: inv?.ref });
    },
  });
}

/** Undo restores the pre-payment snapshot the screen captured — mirrors the prototype's own snapshot-based undo. */
export function useRestoreInvoices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: Invoice[]) => api.restoreInvoices(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.invoices() });
      queryClient.setQueryData<Invoice[]>(billingKeys.invoices(), previous);
    },
  });
}

export function useOpenChallans() {
  return useQuery({ queryKey: billingKeys.openChallans(), queryFn: api.fetchOpenChallans });
}

export function useRemoveOpenChallan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeOpenChallan(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.openChallans() });
      queryClient.setQueryData<OpenChallan[]>(billingKeys.openChallans(), (old) => (old ?? []).filter((c) => c.id !== id));
    },
  });
}

// ---- Challans (first-class doc type, item 13) ----

export function useChallans() {
  return useQuery({ queryKey: billingKeys.challans(), queryFn: api.fetchChallans });
}

export function useAddChallan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (challan: Challan) => api.addChallan(challan),
    onMutate: async (challan) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.challans() });
      queryClient.setQueryData<Challan[]>(billingKeys.challans(), (old) => [challan, ...(old ?? [])]);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.challans() });
    },
  });
}

interface ChallanContext {
  previous?: Challan[];
}

export function useUpdateChallanStatus() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; status: ChallanStatus }, ChallanContext>({
    mutationFn: ({ id, status }) => api.updateChallanStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.challans() });
      const previous = queryClient.getQueryData<Challan[]>(billingKeys.challans());
      queryClient.setQueryData<Challan[]>(billingKeys.challans(), (old) =>
        (old ?? []).map((c) => (c.id === id ? { ...c, status } : c)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(billingKeys.challans(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.challans() });
    },
  });
}

export function useUpdateChallan() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; updates: Partial<Challan> }, ChallanContext>({
    mutationFn: ({ id, updates }) => api.updateChallan(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.challans() });
      const previous = queryClient.getQueryData<Challan[]>(billingKeys.challans());
      queryClient.setQueryData<Challan[]>(billingKeys.challans(), (old) =>
        (old ?? []).map((c) => (c.id === id ? { ...c, ...updates } : c)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(billingKeys.challans(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.challans() });
    },
  });
}

export function useRestoreChallans() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: Challan[]) => api.restoreChallans(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.challans() });
      queryClient.setQueryData<Challan[]>(billingKeys.challans(), previous);
    },
  });
}

// ---- Quotations (item 13) ----

export function useQuotations() {
  return useQuery({ queryKey: billingKeys.quotations(), queryFn: api.fetchQuotations });
}

export function useAddQuotation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quotation: Quotation) => api.addQuotation(quotation),
    onMutate: async (quotation) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.quotations() });
      queryClient.setQueryData<Quotation[]>(billingKeys.quotations(), (old) => [quotation, ...(old ?? [])]);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.quotations() });
    },
  });
}

interface QuotationContext {
  previous?: Quotation[];
}

export function useUpdateQuotationStatus() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; status: QuotationStatus }, QuotationContext>({
    mutationFn: ({ id, status }) => api.updateQuotationStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.quotations() });
      const previous = queryClient.getQueryData<Quotation[]>(billingKeys.quotations());
      queryClient.setQueryData<Quotation[]>(billingKeys.quotations(), (old) =>
        (old ?? []).map((q) => (q.id === id ? { ...q, status } : q)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(billingKeys.quotations(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.quotations() });
    },
  });
}

export function useUpdateQuotation() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { id: string; updates: Partial<Quotation> }, QuotationContext>({
    mutationFn: ({ id, updates }) => api.updateQuotation(id, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.quotations() });
      const previous = queryClient.getQueryData<Quotation[]>(billingKeys.quotations());
      queryClient.setQueryData<Quotation[]>(billingKeys.quotations(), (old) =>
        (old ?? []).map((q) => (q.id === id ? { ...q, ...updates } : q)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(billingKeys.quotations(), context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.quotations() });
    },
  });
}

export function useRestoreQuotations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (previous: Quotation[]) => api.restoreQuotations(previous),
    onMutate: async (previous) => {
      await queryClient.cancelQueries({ queryKey: billingKeys.quotations() });
      queryClient.setQueryData<Quotation[]>(billingKeys.quotations(), previous);
    },
  });
}
