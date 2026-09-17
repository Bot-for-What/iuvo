const db = require('../db/connection');

function baseTicketQuery() {
  return db('tickets as t')
    .join('units as unit', 't.unit_id', 'unit.id')
    .join('departments as department', 't.department_id', 'department.id')
    .join('users as raised_by_user', 't.raised_by', 'raised_by_user.id')
    .leftJoin('users as assigned_to_user', 't.assigned_to', 'assigned_to_user.id')
    .select(
      't.id',
      't.ticket_number',
      't.unit_id',
      't.department_id',
      't.raised_by',
      't.assigned_to',
      't.title',
      't.description',
      't.priority',
      't.status',
      't.resolved_at',
      't.closed_at',
      't.reopened_count',
      't.raiser_has_unread',
      't.assignee_has_unread',
      't.created_at',
      't.updated_at',
      'unit.name as unit_name',
      'department.name as department_name',
      'raised_by_user.username as raised_by_username',
      'raised_by_user.full_name as raised_by_full_name',
      'assigned_to_user.username as assigned_to_username',
      'assigned_to_user.full_name as assigned_to_full_name',
      'assigned_to_user.role as assigned_to_role'
    );
}

async function getTicketById(ticketId) {
  return baseTicketQuery().where('t.id', ticketId).first();
}


function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function serializeMessage(message) {
  return {
    id: message.id,
    ticketId: message.ticket_id,
    senderId: message.sender_id,
    sender: {
      id: message.sender_id,
      username: message.sender_username,
      fullName: message.sender_full_name,
    },
    body: message.body,
    createdAt: message.created_at,
  };
}

function canViewThread(actor, ticket) {
  // Super can view everything
  if (actor.role === 'super') {
    return true;
  }

  // Raiser can view their own tickets
  if (ticket.raised_by === actor.sub) {
    return true;
  }

  // Current assignee can view
  if (ticket.assigned_to === actor.sub) {
    return true;
  }

  // Matching Admin (same unit+department) can view read-only
  // Team users do NOT get read-only access to all department tickets
  if (
    actor.role === 'admin' &&
    ticket.unit_id === actor.unitId &&
    ticket.department_id === actor.departmentId
  ) {
    return true;
  }

  return false;
}

function canPostToThread(actor, ticket) {
  // Super can post everywhere
  if (actor.role === 'super') {
    return true;
  }

  // Raiser can post to their own tickets
  if (ticket.raised_by === actor.sub) {
    return true;
  }

  // Current assignee can post
  if (ticket.assigned_to === actor.sub) {
    return true;
  }

  // Admin who is NOT the assignee cannot post (per requirements 3.3)
  return false;
}

async function getMessages(req, res, next) {
  try {
    const ticket = await getTicketById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    if (!canViewThread(req.user, ticket)) {
      return res.status(403).json({
        message: 'You are not allowed to view this ticket thread.',
      });
    }

    const messages = await db('ticket_messages as tm')
      .select(
        'tm.id',
        'tm.ticket_id',
        'tm.sender_id',
        'tm.body',
        'tm.created_at',
        'sender_user.username as sender_username',
        'sender_user.full_name as sender_full_name'
      )
      .leftJoin('users as sender_user', 'tm.sender_id', 'sender_user.id')
      .where('tm.ticket_id', ticket.id)
      .orderBy('tm.created_at', 'asc');

    // Clear the viewer's unread flag as a side effect (per requirements 3.6)
    const isRaiser = ticket.raised_by === req.user.sub;
    const isCurrentAssignee = ticket.assigned_to === req.user.sub;

    if (isRaiser && ticket.raiser_has_unread) {
      await db('tickets')
        .where('id', ticket.id)
        .update({ raiser_has_unread: false });
    }

    if (isCurrentAssignee && ticket.assignee_has_unread) {
      await db('tickets')
        .where('id', ticket.id)
        .update({ assignee_has_unread: false });
    }

    return res.status(200).json({
      messages: messages.map(serializeMessage),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    return next(error);
  }
}

async function postMessage(req, res, next) {
  try {
    const body = (req.body || {}).body;

    if (typeof body !== 'string' || body.trim() === '') {
      return res.status(400).json({
        message: 'body is required and must be a non-empty string.',
      });
    }

    const ticket = await getTicketById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    // Reject if ticket is closed (per requirements 3.5)
    if (ticket.status === 'closed') {
      return res.status(403).json({
        message: 'Closed tickets cannot receive new messages.',
      });
    }

    if (!canPostToThread(req.user, ticket)) {
      return res.status(403).json({
        message: 'You are not allowed to post messages to this ticket.',
      });
    }

    const isRaiser = ticket.raised_by === req.user.sub;

    // Insert the message
    const [createdMessage] = await db('ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_id: req.user.sub,
        body: body.trim(),
      })
      .returning('id');

    // Set the OTHER party's unread flag (per requirements 3.6)
    const updates = {};

    if (isRaiser) {
      // Raiser posted → notify assignee
      updates.assignee_has_unread = true;
    } else {
      // Someone else (assignee, admin, super) posted → notify raiser
      updates.raiser_has_unread = true;
    }

    if (Object.keys(updates).length > 0) {
      await db('tickets')
        .where('id', ticket.id)
        .update(updates);
    }

    // Fetch the created message with sender details
    const message = await db('ticket_messages as tm')
      .select(
        'tm.id',
        'tm.ticket_id',
        'tm.sender_id',
        'tm.body',
        'tm.created_at',
        'sender_user.username as sender_username',
        'sender_user.full_name as sender_full_name'
      )
      .leftJoin('users as sender_user', 'tm.sender_id', 'sender_user.id')
      .where('tm.id', createdMessage.id)
      .first();

    return res.status(201).json({
      message: serializeMessage(message),
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    return next(error);
  }
}

async function getUnreadSummary(req, res, next) {
  try {
    let hasUnread = false;

    if (req.user.role === 'super') {
      // Super never sees unread indicators (per requirements 3.8)
      hasUnread = false;
    } else if (req.user.role === 'staff') {
      // Staff: check if any ticket they raised has raiser_has_unread = true
      const result = await db('tickets')
        .count('* as count')
        .where('raised_by', req.user.sub)
        .where('raiser_has_unread', true)
        .first();

      hasUnread = Number(result.count) > 0;
    } else if (req.user.role === 'admin' || req.user.role === 'team') {
      // Admin/Team: check both as raiser AND as assignee
      // As raiser
      const asRaiser = await db('tickets')
        .count('* as count')
        .where('raised_by', req.user.sub)
        .where('raiser_has_unread', true)
        .first();

      // As assignee (current assignee)
      const asAssignee = await db('tickets')
        .count('* as count')
        .where('assigned_to', req.user.sub)
        .where('assignee_has_unread', true)
        .first();

      hasUnread = Number(asRaiser.count) > 0 || Number(asAssignee.count) > 0;
    }

    return res.status(200).json({ hasUnread });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMessages,
  postMessage,
  getUnreadSummary,
};
