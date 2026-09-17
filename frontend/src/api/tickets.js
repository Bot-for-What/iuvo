import { apiRequest } from './client';

export async function getTickets(queue = 'all') {
  const response = await apiRequest(
    `/tickets?queue=${encodeURIComponent(queue)}`
  );

  return response.tickets || [];
}

export async function getTicket(ticketId) {
  return apiRequest(`/tickets/${ticketId}`);
}

export async function createTicket(ticket) {
  const response = await apiRequest('/tickets', {
    method: 'POST',
    body: ticket,
  });

  return response.ticket || response;
}

export async function claimTicket(ticketId) {
  const response = await apiRequest(`/tickets/${ticketId}/claim`, {
    method: 'PATCH',
  });

  return response.ticket || response;
}

export async function assignTicket(ticketId, assignedTo, reason = null) {
  const response = await apiRequest(`/tickets/${ticketId}/assign`, {
    method: 'PATCH',
    body: {
      assignedTo,
      ...(reason ? { reason } : {}),
    },
  });

  return response.ticket || response;
}

export async function updateTicketPriority(ticketId, priority) {
  const response = await apiRequest(`/tickets/${ticketId}/priority`, {
    method: 'PATCH',
    body: { priority },
  });

  return response.ticket || response;
}

export async function updateTicketStatus(ticketId, status, resolutionRemarks = null, repairCost = null) {
  const response = await apiRequest(`/tickets/${ticketId}/status`, {
    method: 'PATCH',
    body: { 
      status,
      ...(resolutionRemarks !== null ? { resolutionRemarks } : {}),
      ...(repairCost !== null ? { repairCost } : {})
    },
  });

  return response.ticket || response;
}

export async function reopenTicket(ticketId) {
  const response = await apiRequest(`/tickets/${ticketId}/reopen`, {
    method: 'PATCH',
  });

  return response.ticket || response;
}

export async function unlockTicket(ticketId, reason) {
  const response = await apiRequest(`/tickets/${ticketId}/unlock`, {
    method: 'PATCH',
    body: { reason },
  });

  return response.ticket || response;
}

export async function closeTicket(ticketId) {
  const response = await apiRequest(`/tickets/${ticketId}/close`, {
    method: 'PATCH',
  });

  return response.ticket || response;
}

export async function getUsers() {
  const response = await apiRequest('/users');
  return response.users || response;
}

export async function getMessages(ticketId) {
  const response = await apiRequest(`/tickets/${ticketId}/messages`);
  return response.messages || [];
}

export async function postMessage(ticketId, body) {
  const response = await apiRequest(`/tickets/${ticketId}/messages`, {
    method: 'POST',
    body: { body },
  });
  return response.message || response;
}

export async function getUnreadSummary() {
  const response = await apiRequest('/tickets/unread-summary');
  return response || { hasUnread: false };
}