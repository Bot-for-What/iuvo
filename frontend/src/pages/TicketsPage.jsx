import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ApiError } from '../api/client';
import {
  assignTicket,
  claimTicket,
  createTicket,
  getTicket,
  getTickets,
  getUsers,
  reopenTicket,
  unlockTicket,
  updateTicketPriority,
  updateTicketStatus,
  closeTicket,
  getMessages,
  postMessage,
  getUnreadSummary,
} from '../api/tickets';
import { getUnits } from '../api/units';
import { useAuth } from '../auth/useAuth';
import AppLayout from '../components/AppLayout';


const priorities = ['low', 'medium', 'high', 'urgent'];


const ADMIN_WORK_CATEGORIES = [
  { id: 'all', label: 'All work' },
  { id: 'needs_assignment', label: 'Needs assignment' },
  { id: 'my_active', label: 'My active work' },
  { id: 'team_active', label: 'Team active work' },
];

const ACTIVE_WORK_STATUSES = new Set(['assigned', 'in_progress']);

function getTicketAge(createdAt) {
  const createdAtMs = new Date(createdAt).getTime();

  if (Number.isNaN(createdAtMs)) {
    return {
      label: '—',
      accessibleLabel: 'Ticket age is unavailable',
    };
  }

  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - createdAtMs) / 60000),
  );

  if (elapsedMinutes < 60) {
    return {
      label: `${elapsedMinutes} min`,
      accessibleLabel: `Ticket age: ${elapsedMinutes} ${
        elapsedMinutes === 1 ? 'minute' : 'minutes'
      } since creation`,
    };
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return {
      label: `${elapsedHours} ${elapsedHours === 1 ? 'hour' : 'hours'}`,
      accessibleLabel: `Ticket age: ${elapsedHours} ${
        elapsedHours === 1 ? 'hour' : 'hours'
      } since creation`,
    };
  }

  const elapsedDays = Math.floor(elapsedHours / 24);

  if (elapsedDays < 21) {
    return {
      label: `${elapsedDays} ${elapsedDays === 1 ? 'day' : 'days'}`,
      accessibleLabel: `Ticket age: ${elapsedDays} ${
        elapsedDays === 1 ? 'day' : 'days'
      } since creation`,
    };
  }

  const elapsedWeeks = Math.floor(elapsedDays / 7);

  return {
    label: `${elapsedWeeks} ${elapsedWeeks === 1 ? 'week' : 'weeks'}`,
    accessibleLabel: `Ticket age: ${elapsedWeeks} ${
      elapsedWeeks === 1 ? 'week' : 'weeks'
    } since creation`,
  };
}

function TicketAgeBadge({ createdAt }) {
  const age = getTicketAge(createdAt);

  return (
    <span
      aria-label={age.accessibleLabel}
      className="ticket-age-badge"
      title="Ticket age"
    >
      {age.label}
    </span>
  );
}

function UnreadIcon() {
  return (
    <span
      className="ticket-unread-icon"
      title="Unread messages"
      aria-label="Unread messages"
    />
  );
}

function message(error, fallback) {
  return error instanceof ApiError ? error.message : fallback;
}

function label(value) {
  return String(value || '').replaceAll('_', ' ');
}

function date(value) {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';
}

function TicketDetails({
  actionError,
  assigneeId,
  busy,
  canEditPriority,
  canProgress,
  canReopen,
  canClose,
  canWork,
  detailScrollRef,
  eligibleAssignees,
  onAction,
  onAssigneeChange,
  onClose,
  onReasonChange,
  onPriorityChange,
  onResolveClick,
  onSendMessage,
  reason,
  ticket,
  user,
  events,
  messages,
  messageText,
  setMessageText,
  messageBusy,
}) {
  if (!ticket) {
    return (
      <aside
        aria-label="Ticket details"
        className="ticket-detail-pane ticket-detail-empty"
      >
        <div className="ticket-detail-empty-content">
          <p className="eyebrow">Ticket details</p>
          <h2>Select a ticket</h2>
          <p>
            Choose a ticket from the list to review its details, history, and
            available actions.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={`Ticket details for ${ticket.ticketNumber}`}
      className="ticket-detail-pane"
    >
      <div className="ticket-detail-header">
        <div>
          <p className="ticket-number">{ticket.ticketNumber}</p>
          <h2>{ticket.title}</h2>
        </div>

        <button
          aria-label="Close ticket details and return to the ticket list"
          className="button button-secondary ticket-close-details-button"
          onClick={onClose}
          type="button"
        >
          <span className="ticket-close-details-desktop">Close details</span>
          <span className="ticket-close-details-mobile">Back to tickets</span>
        </button>
      </div>

      <div className="ticket-detail-scroll" ref={detailScrollRef}>
        <p className="ticket-description">{ticket.description}</p>

        <div className="ticket-detail-statuses">
          <span className={`status-pill status-${ticket.status}`}>
            {label(ticket.status)}
          </span>
          <span className="priority-badge">
            Priority: {label(ticket.priority)}
          </span>
        </div>

        <dl className="ticket-detail-grid">
          <div>
            <dt>Raised by</dt>
            <dd>{ticket.raisedBy?.fullName || ticket.raisedBy?.username || '—'}</dd>
          </div>
          <div>
            <dt>Assigned to</dt>
            <dd>{ticket.assignedTo?.fullName || ticket.assignedTo?.username || 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Unit</dt>
            <dd>{ticket.unitName || '—'}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{ticket.departmentName || '—'}</dd>
          </div>
          <div>
            <dt>Resolved</dt>
            <dd>{date(ticket.resolvedAt)}</dd>
          </div>
          <div>
            <dt>Closed</dt>
            <dd>{date(ticket.closedAt)}</dd>
          </div>
        </dl>
{ticket.status === 'resolved' || ticket.status === 'closed' ? (
  <div className="ticket-resolution-details">
    <h3>Resolution details</h3>
    <dl className="ticket-detail-grid">
      <div>
        <dt>Resolution remarks</dt>
        <dd>{ticket.resolutionRemarks || '—'}</dd>
      </div>
      <div>
        <dt>Repair cost</dt>
        <dd>
          {ticket.repairCost !== null && ticket.repairCost !== undefined
            ? `₹ ${Number(ticket.repairCost).toFixed(2)}`
            : '—'}
        </dd>
      </div>
    </dl>
  </div>
) : null}
        {actionError ? (
          <div className="form-error" role="alert">
            <span aria-hidden="true">!</span>
            <p>{actionError}</p>
          </div>
        ) : null}

        <section aria-labelledby="ticket-actions-heading" className="ticket-action-section">
          <h3 id="ticket-actions-heading">Actions</h3>

          <div className="ticket-actions">
            {canWork && ticket.status === 'open' && !ticket.assignedTo ? (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => onAction(() => claimTicket(ticket.id))}
                type="button"
              >
                Claim ticket
              </button>
            ) : null}

            {(user.role === 'super'
              || (user.role === 'admin'
                && canWork
                && ticket.status === 'open'
                && !ticket.assignedTo))
              && ticket.status !== 'closed'
              && ticket.status !== 'resolved' ? (
                <div className="ticket-assignment-controls">
                  <label>
                    Assignee
                    <select
                      disabled={busy}
                      onChange={(event) => onAssigneeChange(event.target.value)}
                      value={assigneeId}
                    >
                      <option value="">Choose assignee</option>
                      {eligibleAssignees.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.fullName} ({item.role})
                        </option>
                      ))}
                    </select>
                  </label>

                  {user.role === 'super' ? (
                    <label>
                      Super reason
                      <input
                        disabled={busy}
                        onChange={(event) => onReasonChange(event.target.value)}
                        placeholder="Required reason"
                        value={reason}
                      />
                    </label>
                  ) : null}

                  <button
                    className="button button-primary"
                    disabled={
                      busy
                      || !assigneeId
                      || (user.role === 'super' && !reason.trim())
                    }
                    onClick={() => onAction(() => (
                      assignTicket(ticket.id, assigneeId, reason.trim())
                    ))}
                    type="button"
                  >
                    {ticket.assignedTo ? 'Reassign ticket' : 'Assign ticket'}
                  </button>
                </div>
              ) : null}

            {canEditPriority ? (
              <label className="ticket-priority-control">
                Priority
                <select
                  disabled={busy}
                  onChange={(event) => onPriorityChange(event.target.value)}
                  value={ticket.priority}
                >
                  {priorities.map((item) => (
                    <option key={item} value={item}>
                      {label(item)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {canProgress && ticket.status === 'assigned' ? (
              <button
                className="button button-primary"
                disabled={busy}
                onClick={() => onAction(() => updateTicketStatus(ticket.id, 'in_progress'))}
                type="button"
              >
                Start work
              </button>
            ) : null}

{canProgress && ticket.status === 'in_progress' ? (
    <button
      className="button button-primary"
      disabled={busy}
      onClick={onResolveClick}
      type="button"
    >
      Resolve ticket
    </button>
  ) : null}

            {canReopen ? (
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => onAction(() => reopenTicket(ticket.id))}
                type="button"
              >
                Reopen ticket
              </button>
            ) : null}

            {canClose ? (
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => onAction(() => closeTicket(ticket.id))}
                type="button"
              >
                Close ticket
              </button>
            ) : null}

            {user.role === 'super' && ticket.status === 'closed' ? (
              <div className="ticket-assignment-controls">
                <label>
                  Unlock reason
                  <input
                    disabled={busy}
                    onChange={(event) => onReasonChange(event.target.value)}
                    placeholder="Required reason"
                    value={reason}
                  />
                </label>

                <button
                  className="button button-primary"
                  disabled={busy || !reason.trim()}
                  onClick={() => onAction(() => unlockTicket(ticket.id, reason.trim()))}
                  type="button"
                >
                  Unlock ticket
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="ticket-history-heading" className="ticket-history-section">
          <h3 id="ticket-history-heading">History</h3>

          {(events || []).length === 0 ? (
            <p className="muted">No audit events are available for this ticket.</p>
          ) : (
            <div className="event-list">
              {events.map((event) => (
                <article className="ticket-event" key={event.id}>
                  <strong>{label(event.eventType)}</strong>
                  <p>
                    {event.actor?.fullName || event.actor?.username || 'System'}
                    {event.eventType === 'assigned' || event.eventType === 'reassigned' ? (
                      <>
                        {event.fromValue ? ` → ${event.toValue ? 'reassigned' : 'assigned'}` : ` → ${event.toValue ? 'assigned' : ''}`}
                      </>
                    ) : event.eventType === 'claimed' ? (
                      ' claimed this ticket'
                    ) : event.eventType === 'status_change' ? (
                      ` changed status to ${label(event.toValue)}`
                    ) : event.eventType === 'priority_change' ? (
                      ` changed priority to ${label(event.toValue)}`
                    ) : event.eventType === 'created' ? (
                      ' created this ticket'
                    ) : event.eventType === 'reopened' ? (
                      ' reopened this ticket'
                    ) : event.eventType === 'unlocked' ? (
                      ' unlocked this ticket'
                    ) : event.eventType === 'closed' ? (
                      ' closed this ticket'
                    ) : (
                      ` ${label(event.eventType)}`
                    )}
                  </p>
                  <small>{date(event.createdAt)}</small>
                  {event.reason ? <p>Reason: {event.reason}</p> : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
      
  <MessageThread
    ticket={ticket}
    messages={messages}
    onSendMessage={onSendMessage}
    busy={messageBusy}
    messageText={messageText}
    setMessageText={setMessageText}
  />
    </aside>
  );
}

function ResolveModal({ ticket, busy, onSubmit, onCancel, existingRemarks, existingCost }) {
  const [remarks, setRemarks] = useState(existingRemarks || '');
  const [cost, setCost] = useState(existingCost !== null && existingCost !== undefined ? String(existingCost) : '');
  const [error, setError] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!remarks.trim()) {
      setError('Resolution remarks are required.');
      return;
    }

    const costNum = cost === '' ? 0 : Number(cost);
    if (isNaN(costNum) || costNum < 0) {
      setError('Repair cost must be a number >= 0.');
      return;
    }

    onSubmit(remarks.trim(), costNum);
  }

  return (
    <div
      aria-labelledby="resolve-modal-title"
      aria-modal="true"
      className="modal-backdrop"
      onClick={onCancel}
      role="dialog"
    >
      <section
        className="modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="management-edit-modal-header">
          <div>
            <p className="eyebrow">Resolve ticket</p>
            <h2 id="resolve-modal-title">{ticket.ticketNumber}</h2>
            <p>Provide details about the resolution before marking this ticket as resolved.</p>
          </div>

          <button
            className="button button-secondary"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        </div>

        {error ? (
          <div className="form-error" role="alert">
            {error}
          </div>
        ) : null}

        <form className="ticket-create-form" onSubmit={handleSubmit}>
          <label className="ticket-create-field-wide">
            Resolution remarks
            <textarea
              disabled={busy}
              onChange={(event) => setRemarks(event.target.value)}
              required
              rows="4"
              value={remarks}
              placeholder="Describe what was done to resolve this ticket..."
            />
          </label>

          <label>
            Repair cost
            <input
              disabled={busy}
              onChange={(event) => setCost(event.target.value)}
              type="number"
              value={cost}
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </label>

          <div className="ticket-create-submit">
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? 'Resolving…' : 'Resolve ticket'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function MessageThread({ ticket, messages, onSendMessage, busy, messageText, setMessageText }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!messageText.trim() || busy) return;
    await onSendMessage(messageText.trim());
    setMessageText('');
  }

  return (
    <section className="ticket-message-thread">
      <h3>Messages</h3>

      <div className="ticket-messages-list" ref={scrollRef}>
        {messages.length === 0 ? (
          <p className="muted">No messages yet. Start the conversation.</p>
        ) : (
          messages.map((msg) => (
            <article
              key={msg.id}
              className={`ticket-message ${msg.senderId === ticket.raisedBy?.id ? 'ticket-message-raiser' : 'ticket-message-assignee'}`}
            >
              <div className="ticket-message-header">
                <strong>{msg.sender.fullName || msg.sender.username}</strong>
                <small>{date(msg.createdAt)}</small>
              </div>
              <p className="ticket-message-body">{msg.body}</p>
            </article>
          ))
        )}
      </div>

      <form className="ticket-message-form" onSubmit={handleSubmit}>
        <textarea
          disabled={busy || ticket.status === 'closed'}
          onChange={(e) => setMessageText(e.target.value)}
          placeholder={ticket.status === 'closed' ? 'Closed tickets cannot receive new messages' : 'Type a message...'}
          rows="2"
          value={messageText}
        />
        <button
          className="button button-primary"
          disabled={busy || !messageText.trim() || ticket.status === 'closed'}
          type="submit"
        >
          Send
        </button>
      </form>
    </section>
  );
}

export default function TicketsPage() {
  const { user } = useAuth();
  const detailScrollRef = useRef(null);
  const ticketWorkspaceRef = useRef(null);
  const hasQueues = ['super', 'admin', 'team'].includes(user.role);

  const [queue, setQueue] = useState('my');
  const [adminWorkCategory, setAdminWorkCategory] = useState('all');
  const [tickets, setTickets] = useState([]);
  const [units, setUnits] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [unitId, setUnitId] = useState(user.unitId || '');
  const [departmentId, setDepartmentId] = useState(user.departmentId || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [reason, setReason] = useState('');
const [messages, setMessages] = useState([]);
const [messageText, setMessageText] = useState('');
const [messageBusy, setMessageBusy] = useState(false);
const [hasUnreadMessages, setHasUnreadMessages] = useState(false);


  const selectedUnit = useMemo(
    () => units.find((unit) => unit.id === unitId),
    [units, unitId],
  );

  const activeUnits = useMemo(
    () => units.filter((unit) => unit.isActive),
    [units],
  );

  const departments = useMemo(
    () => (selectedUnit?.departments || []).filter((department) => department.isActive),
    [selectedUnit],
  );

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionRemarks, setResolutionRemarks] = useState('');
  const [repairCost, setRepairCost] = useState('');

  async function load(nextQueue = queue) {
    setLoading(true);
    setError('');

    try {
      const [ticketData, unitData, userData] = await Promise.all([
        getTickets(hasQueues ? nextQueue : 'my'),
        getUnits(),
        ['super', 'admin'].includes(user.role) ? getUsers() : Promise.resolve([]),
      ]);

      setTickets(ticketData);
      setUnits(unitData);
      setUsers(userData);

      const availableUnits = unitData.filter((item) => item.isActive);
      const defaultUnitId = user.unitId || availableUnits[0]?.id || '';
      const defaultUnit = unitData.find((item) => item.id === defaultUnitId);
      const defaultDepartmentId = user.departmentId
        || defaultUnit?.departments?.find((item) => item.isActive)?.id
        || '';

      setUnitId((current) => current || defaultUnitId);
      setDepartmentId((current) => current || defaultDepartmentId);
    } catch (loadError) {
      setError(message(loadError, 'Unable to load the ticket workspace.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [queue]);

  useEffect(() => {
    if (!selectedTicket?.ticket?.id) {
      return;
    }

    detailScrollRef.current?.scrollTo({
      top: 0,
      behavior: 'auto',
    });

    if (window.matchMedia('(max-width: 767px)').matches) {
      window.requestAnimationFrame(() => {
        ticketWorkspaceRef.current?.scrollIntoView({
          block: 'start',
          behavior: 'auto',
        });
      });
    }
  }, [selectedTicket?.ticket?.id]);

async function openTicket(id) {
  setActionError('');

  try {
    const ticketData = await getTicket(id);
    setSelectedTicket(ticketData);
    setAssigneeId('');
    setReason('');
    
    await loadMessages(id);
    
    const refreshedTickets = await getTickets(hasQueues ? queue : 'my');
    setTickets(refreshedTickets);
    
    window.dispatchEvent(new CustomEvent('iuvo:refresh-unread'));
    
    setHasUnreadMessages(false);
  } catch (loadError) {
    setActionError(message(loadError, 'Unable to load ticket details.'));
  }
}

  async function refreshSelected(id = selectedTicket?.ticket?.id) {
    await load();

    if (id) {
      await openTicket(id);
    }
  }

  async function submitTicket(event) {
    event.preventDefault();
    setBusy(true);
    setActionError('');

    try {
      await createTicket({
        unitId,
        departmentId,
        title: title.trim(),
        description: description.trim(),
        priority,
      });

      setTitle('');
      setDescription('');
      setPriority('medium');
      await load('my');
    } catch (createError) {
      setActionError(message(createError, 'Unable to create the ticket.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleResolveClick() {
    // Pre-fill with existing values if ticket was already resolved (re-resolve scenario)
    setResolutionRemarks(ticket.resolutionRemarks || '');
    setRepairCost(ticket.repairCost !== null && ticket.repairCost !== undefined ? String(ticket.repairCost) : '');
    setShowResolveModal(true);
  }
  async function handleResolveSubmit(remarks, cost) {
    setBusy(true);
    setActionError('');

    try {
      await updateTicketStatus(ticket.id, 'resolved', remarks, cost);
      await refreshSelected();
      setShowResolveModal(false);
    } catch (actionFailure) {
      setActionError(message(actionFailure, 'Ticket could not be resolved.'));
    } finally {
      setBusy(false);
    }
  }

  async function act(callback) {
    setBusy(true);
    setActionError('');

    try {
      await callback();
      await refreshSelected();
    } catch (actionFailure) {
      setActionError(message(actionFailure, 'Ticket action could not be completed.'));
    } finally {
      setBusy(false);
    }
  }

  async function loadMessages(ticketId) {
  try {
    const msgs = await getMessages(ticketId);
    setMessages(msgs);
  } catch (err) {
    console.error('Failed to load messages:', err);
    setMessages([]);
  }
}

async function sendMessage(body) {
  setMessageBusy(true);
  try {
    const newMessage = await postMessage(ticket.id, body);
    setMessages((prev) => [...prev, newMessage]);
    // Refresh to update unread flags
    await openTicket(ticket.id);
  } catch (err) {
    setActionError(message(err, 'Failed to send message.'));
  } finally {
    setMessageBusy(false);
  }
}

const closeTicketDetail = useCallback(async () => {
  setSelectedTicket(null);
  setActionError('');
  setAssigneeId('');
  setReason('');
  setMessages([]);
  await load(queue);
}, [queue]);

  const ticket = selectedTicket?.ticket;
  const canWork = ticket
    && ['admin', 'team'].includes(user.role)
    && ticket.unitId === user.unitId
    && ticket.departmentId === user.departmentId;
  const canEditPriority = ticket
    && ticket.status !== 'closed'
    && (user.role === 'super' || canWork);
  const canProgress = ticket
    && ticket.assignedTo
    && (user.role === 'super' || (canWork && ticket.assignedTo.id === user.id));
  const canReopen = ticket?.status === 'resolved'
    && (user.role === 'super' || ticket.raisedBy?.id === user.id);
  const canClose = ticket?.status === 'resolved'
    && (user.role === 'super' || ticket.raisedBy?.id === user.id);
  const eligibleAssignees = ticket
    ? users.filter((item) => (
      item.isActive !== false
      && (item.role === 'admin' || item.role === 'team')
      && item.unitId === ticket.unitId
      && item.departmentId === ticket.departmentId
    ))
    : [];

    const isAdminWorkQueue = user.role === 'admin' && queue === 'work';

    const adminWorkTickets = useMemo(() => {
      const allWork = tickets;

      return {
        all: allWork,
        needs_assignment: allWork.filter(
          (item) => item.status === 'open' && !item.assignedTo,
        ),
        my_active: allWork.filter(
          (item) => (
            ACTIVE_WORK_STATUSES.has(item.status)
            && item.assignedTo?.id === user.id
          ),
        ),
        team_active: allWork.filter(
          (item) => (
            ACTIVE_WORK_STATUSES.has(item.status)
            && item.assignedTo?.role === 'team'
          ),
        ),
      };
    }, [tickets, user.id]);

    const displayedTickets = useMemo(() => {
      if (!isAdminWorkQueue) {
        return tickets;
      }

      const activeCategoryTickets = adminWorkTickets[adminWorkCategory] || [];

      if (adminWorkCategory === 'all') {
        return activeCategoryTickets;
      }

      return [...activeCategoryTickets].sort(
        (firstTicket, secondTicket) => (
          new Date(firstTicket.createdAt).getTime()
          - new Date(secondTicket.createdAt).getTime()
        ),
      );
    }, [
      adminWorkCategory,
      adminWorkTickets,
      isAdminWorkQueue,
      tickets,
    ]);

    const activeAdminCategory = ADMIN_WORK_CATEGORIES.find(
      (category) => category.id === adminWorkCategory,
    );

  return (
    <AppLayout>
<section className="content-card ticket-section ticket-page-header">
  <p className="eyebrow">{user.role}</p>
  <h1>{user.role === 'staff' ? 'My tickets' : 'Tickets'}</h1>
  <p>
    {user.role === 'staff'
      ? 'Raise service requests and track the status of tickets you have submitted.'
      : user.role === 'admin' || user.role === 'team'
        ? 'Review assigned department tickets, manage workload, and update ticket status.'
        : 'View and manage all tickets across all units and departments.'}
  </p>

        {hasQueues ? (
          <div aria-label="Ticket queue selection" className="queue-tabs">
            {['my', 'work'].map((value) => (
              <button
                aria-pressed={queue === value}
                className={`button ${queue === value ? 'button-primary' : 'button-secondary'}`}
                key={value}
                onClick={() => {
                    setSelectedTicket(null);
                    setActionError('');
                    setAdminWorkCategory('all');
                    setQueue(value);
                }}
                type="button"
              >
                {value === 'my' ? 'My raised tickets' : 'Work queue'}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {queue !== 'work' ? (
      <section className="content-card ticket-section ticket-create-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">New request</p>
            <h2>Raise a ticket</h2>
          </div>
        </div>

        <form className="ticket-create-form" onSubmit={submitTicket}>
          <label>
            Unit
            <select
              disabled={busy || Boolean(user.unitId)}
              onChange={(event) => {
                const value = event.target.value;
                const selected = units.find((item) => item.id === value);
                const firstActiveDepartment = selected?.departments?.find(
                  (item) => item.isActive,
                );

                setUnitId(value);
                setDepartmentId(firstActiveDepartment?.id || '');
              }}
              required
              value={unitId}
            >
              <option value="">Choose a unit</option>
              {activeUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Department
            <select
              disabled={busy}
              onChange={(event) => setDepartmentId(event.target.value)}
              required
              value={departmentId}
            >
              <option value="">Choose a department</option>
              {departments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>

          <label className="ticket-create-field-wide">
            Title
            <input
              disabled={busy}
              maxLength="255"
              onChange={(event) => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>

          <label className="ticket-create-field-wide">
            Description
            <textarea
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
              required
              rows="3"
              value={description}
            />
          </label>

          <label>
            Priority
            <select
              disabled={busy}
              onChange={(event) => setPriority(event.target.value)}
              value={priority}
            >
              {priorities.map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </label>

          <div className="ticket-create-submit">
            <button className="button button-primary" disabled={busy} type="submit">
              {busy ? 'Creating ticket…' : 'Create ticket'}
            </button>
          </div>
        </form>
      </section>
      ) : null}

      <section
        className={`ticket-workspace${ticket ? ' ticket-workspace-has-selection' : ''}`}
        ref={ticketWorkspaceRef}
      >
        <div className="ticket-list-pane">
          <div className="ticket-list-pane-header">
            <div>
              <p className="eyebrow">{queue === 'work' ? 'Assigned department work' : 'Ticket list'}</p>
              <h2>{queue === 'work' ? 'Work queue' : 'My raised tickets'}</h2>
            </div>

            <button
              className="button button-secondary"
              disabled={loading}
              onClick={() => load()}
              type="button"
            >
              Refresh
            </button>
          </div>

          {isAdminWorkQueue ? (
            <div className="admin-work-queue-overview">
              <div aria-label="Admin Work Queue counts" className="admin-work-queue-counts">
                {ADMIN_WORK_CATEGORIES.map((category) => (
                  <span className="admin-work-queue-count" key={category.id}>
                    <strong>{adminWorkTickets[category.id].length}</strong>
                    {category.label}
                  </span>
                ))}
              </div>

              <div
                aria-label="Admin Work Queue category"
                className="admin-work-queue-categories"
                role="group"
              >
                {ADMIN_WORK_CATEGORIES.map((category) => (
                  <button
                    aria-pressed={adminWorkCategory === category.id}
                    className={`button ${
                      adminWorkCategory === category.id
                        ? 'button-primary'
                        : 'button-secondary'
                    }`}
                    key={category.id}
                    onClick={() => {
                      setSelectedTicket(null);
                      setActionError('');
                      setAdminWorkCategory(category.id);
                    }}
                    type="button"
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="form-error" role="alert">
              <span aria-hidden="true">!</span>
              <p>{error}</p>
            </div>
          ) : null}

          <div className="ticket-list-scroll">
            {loading ? <p className="ticket-list-message">Loading tickets…</p> : null}

            {!loading && !error && tickets.length === 0 ? (
              <div className="ticket-list-message">
                <h3>No tickets available</h3>
                <p>
                  {isAdminWorkQueue
                    ? `There are no tickets in ${activeAdminCategory?.label || 'this'} right now.`
                    : queue === 'work'
                      ? 'There are no tickets currently available in this Work queue.'
                      : 'Tickets you raise will appear here.'}
                </p>
              </div>
            ) : null}

            {!loading && !error ? (
              <div className="ticket-list">
                {displayedTickets.map((item) => {
  // Check if current user has unread on this ticket
  const isRaiser = item.raisedBy?.id === user.id;
  const isAssignee = item.assignedTo?.id === user.id;
  const hasUnread = (isRaiser && item.raiserHasUnread) || (isAssignee && item.assigneeHasUnread);
  
  return (
    <button
      aria-current={ticket?.id === item.id ? 'true' : undefined}
      className={`ticket-list-item ticket-button${
        ticket?.id === item.id ? ' ticket-list-item-selected' : ''
      }`}
      key={item.id}
      onClick={() => openTicket(item.id)}
      type="button"
    >
      <div className="ticket-list-item-main">
        {hasUnread && <UnreadIcon />}
        <p className="ticket-number">{item.ticketNumber}</p>
        <h3>{item.title}</h3>
        <p>{item.unitName} · {item.departmentName}</p>
      </div>

      <div className="ticket-meta">
        <div className="ticket-meta-badges">
          <span className={`status-pill status-${item.status}`}>
            {label(item.status)}
          </span>

          <TicketAgeBadge createdAt={item.createdAt} />
        </div>

        <span>Priority: {label(item.priority)}</span>
        <span>Created: {date(item.createdAt)}</span>
      </div>
    </button>
  );
})}
              </div>
            ) : null}
          </div>
        </div>

        <TicketDetails
          actionError={actionError}
          assigneeId={assigneeId}
          busy={busy}
          canEditPriority={canEditPriority}
          canProgress={canProgress}
          canReopen={canReopen}
          canClose={canClose}
          canWork={canWork}
          eligibleAssignees={eligibleAssignees}
          events={selectedTicket?.events}
          detailScrollRef={detailScrollRef}
          onAction={act}
          onAssigneeChange={setAssigneeId}
          onClose={closeTicketDetail}
          onPriorityChange={(nextPriority) => (
            act(() => updateTicketPriority(ticket.id, nextPriority))
          )}
          onReasonChange={setReason}
          reason={reason}
          onResolveClick={handleResolveClick}
          onSendMessage={sendMessage}
          messages={messages}
          messageText={messageText}
          setMessageText={setMessageText}
          messageBusy={messageBusy}
          ticket={ticket}
          user={user}
        />
        {showResolveModal && (
        <ResolveModal
          ticket={ticket}
          busy={busy}
          onSubmit={handleResolveSubmit}
          onCancel={() => setShowResolveModal(false)}
          existingRemarks={resolutionRemarks}
          existingCost={repairCost}
        />
      )}
      </section>
    </AppLayout>
  );
}