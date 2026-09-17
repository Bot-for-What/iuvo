const db = require('../db/connection');

const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);
const VALID_STATUSES = new Set([
  'open',
  'assigned',
  'in_progress',
  'resolved',
  'closed',
]);
const VALID_QUEUES = new Set(['all', 'my', 'work']);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function throwHttp(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function serializeTicket(ticket) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticket_number,
    unitId: ticket.unit_id,
    unitName: ticket.unit_name,
    departmentId: ticket.department_id,
    departmentName: ticket.department_name,
    raisedBy: {
      id: ticket.raised_by,
      username: ticket.raised_by_username,
      fullName: ticket.raised_by_full_name,
    },
    assignedTo: ticket.assigned_to
      ? {
          id: ticket.assigned_to,
          username: ticket.assigned_to_username,
          fullName: ticket.assigned_to_full_name,
          role: ticket.assigned_to_role,
        }
      : null,
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status,
    resolvedAt: ticket.resolved_at,
    closedAt: ticket.closed_at,
    reopenedCount: ticket.reopened_count,
    resolutionRemarks: ticket.resolution_remarks,
    repairCost: ticket.repair_cost,
    raiserHasUnread: ticket.raiser_has_unread,
    assigneeHasUnread: ticket.assignee_has_unread,
    createdAt: ticket.created_at,
    updatedAt: ticket.updated_at,
  };
}

function serializeEvent(event) {
  return {
    id: event.id,
    ticketId: event.ticket_id,
    actorId: event.actor_id,
    actor: event.actor_full_name
      ? {
          id: event.actor_id,
          username: event.actor_username,
          fullName: event.actor_full_name,
        }
      : null,
    eventType: event.event_type,
    fromValue: event.from_value,
    toValue: event.to_value,
    reason: event.reason,
    resolutionRemarks: event.resolution_remarks,
    repairCost: event.repair_cost,
    createdAt: event.created_at,
  };
}

function baseTicketQuery(connection = db) {
  return connection('tickets as t')
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
      't.resolution_remarks',
      't.repair_cost',
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

async function getTicketById(ticketId, connection = db) {
  return baseTicketQuery(connection)
    .where('t.id', ticketId)
    .first();
}

async function insertTicketEvent(
  connection,
  ticketId,
  actorId,
  eventType,
  fromValue = null,
  toValue = null,
  reason = null,
  resolutionRemarks = null,
  repairCost = null
) {
  const result = await connection('ticket_events')
    .insert({
      ticket_id: ticketId,
      actor_id: actorId,
      event_type: eventType,
      from_value: fromValue,
      to_value: toValue,
      reason,
      resolution_remarks: resolutionRemarks,
      repair_cost: repairCost,
    })
    .returning([
      'id',
      'ticket_id',
      'actor_id',
      'event_type',
      'from_value',
      'to_value',
      'reason',
      'resolution_remarks',
      'repair_cost',
      'created_at',
    ]);

  return Array.isArray(result) ? result[0] : result;
}

function isDepartmentWorkTicket(actor, ticket) {
  return (
    ticket.unit_id === actor.unitId &&
    ticket.department_id === actor.departmentId &&
    ticket.raised_by !== actor.sub
  );
}

function canViewTicket(actor, ticket) {
  if (actor.role === 'super') {
    return true;
  }

  if (actor.role === 'management') {
    return false;
  }

  if (actor.role === 'staff') {
    return ticket.raised_by === actor.sub;
  }

  if (actor.role === 'admin' || actor.role === 'team') {
    return ticket.raised_by === actor.sub || isDepartmentWorkTicket(actor, ticket);
  }

  return false;
}

function canRaiseInScope(actor, unitId) {
  return actor.role === 'super' || actor.unitId === unitId;
}

async function validateActiveTicketScope(connection, unitId, departmentId) {
  const unit = await connection('units')
    .select('id', 'is_active')
    .where('id', unitId)
    .first();

  if (!unit) {
    return { status: 400, message: 'Unit not found.' };
  }

  if (!unit.is_active) {
    return { status: 400, message: 'Unit is disabled.' };
  }

  const department = await connection('departments')
    .select('id')
    .where('id', departmentId)
    .first();

  if (!department) {
    return { status: 400, message: 'Department not found.' };
  }

  const unitDepartment = await connection('unit_departments')
    .select('id', 'is_active')
    .where({
      unit_id: unitId,
      department_id: departmentId,
    })
    .first();

  if (!unitDepartment) {
    return {
      status: 400,
      message: 'Department is not configured for this unit.',
    };
  }

  if (!unitDepartment.is_active) {
    return {
      status: 400,
      message: 'Department is disabled for this unit.',
    };
  }

  return null;
}

async function generateTicketNumber(connection, unitId, departmentId) {
  const unit = await connection('units')
    .select('name')
    .where('id', unitId)
    .first();

  const department = await connection('departments')
    .select('name')
    .where('id', departmentId)
    .first();

  if (!unit || !department) {
    throw new Error('Unable to generate ticket number for an unknown scope.');
  }

  const unitCode =
    unit.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8) || 'UNIT';

  const departmentCode =
    department.name
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 8) || 'DEPT';

  const prefix = `${unitCode}-${departmentCode}`;

  // Prevent concurrent first-use initialization and allocation for this scope.
  await connection.raw(
    `
      SELECT pg_advisory_xact_lock(
        hashtextextended(?::text, 0)
      )
    `,
    [`${unitId}:${departmentId}`]
  );

  let counter = await connection('ticket_number_counters')
    .where({
      unit_id: unitId,
      department_id: departmentId,
    })
    .forUpdate()
    .first();

  if (!counter) {
    const maxResult = await connection.raw(
      `
        SELECT COALESCE(
          MAX(
            CAST(
              SUBSTRING(ticket_number FROM ?) AS INTEGER
            )
          ),
          0
        ) AS max_sequence
        FROM tickets
        WHERE ticket_number ~ ?
      `,
      [`^${prefix}-(\\d+)$`, `^${prefix}-(\\d+)$`]
    );

    const highestExistingSequence = Number(
      maxResult.rows[0].max_sequence || 0
    );

    await connection('ticket_number_counters').insert({
      unit_id: unitId,
      department_id: departmentId,
      next_sequence: highestExistingSequence + 1,
    });

    counter = await connection('ticket_number_counters')
      .where({
        unit_id: unitId,
        department_id: departmentId,
      })
      .forUpdate()
      .first();
  }

  if (!counter) {
    throw new Error('Unable to initialize ticket-number counter.');
  }

  let nextSequence = counter.next_sequence;

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `${prefix}-${String(nextSequence).padStart(6, '0')}`;

    const existingTicket = await connection('tickets')
      .select('id')
      .where('ticket_number', candidate)
      .first();

    if (!existingTicket) {
      await connection('ticket_number_counters')
        .where({
          unit_id: unitId,
          department_id: departmentId,
        })
        .update({
          next_sequence: nextSequence + 1,
        });

      return candidate;
    }

    nextSequence += 1;
  }

  throw new Error(
    `Unable to allocate a unique ticket number for prefix ${prefix}.`
  );
}

async function createTicket(req, res, next) {
  try {
    const body = req.body || {};
    const title = normalizeString(body.title);
    const description = normalizeString(body.description);
    const priority = normalizeString(body.priority).toLowerCase();
    const unitId = body.unitId;
    const departmentId = body.departmentId;

    if (!title || !description || !priority || !unitId || !departmentId) {
      return res.status(400).json({
        message: 'title, description, priority, unitId, and departmentId are required.',
      });
    }

    if (!VALID_PRIORITIES.has(priority)) {
      return res.status(400).json({
        message: 'priority must be one of: low, medium, high, urgent.',
      });
    }

    if (!canRaiseInScope(req.user, unitId)) {
      return res.status(403).json({
        message: 'You can raise tickets only in your own unit.',
      });
    }

    const ticket = await db.transaction(async (trx) => {
      const scopeError = await validateActiveTicketScope(trx, unitId, departmentId);

      if (scopeError) {
        throwHttp(scopeError.status, scopeError.message);
      }

      const ticketNumber = await generateTicketNumber(trx, unitId, departmentId);

      const [createdTicket] = await trx('tickets')
        .insert({
          ticket_number: ticketNumber,
          unit_id: unitId,
          department_id: departmentId,
          raised_by: req.user.sub,
          title,
          description,
          priority,
          status: 'open',
        })
        .returning('id');

      await insertTicketEvent(
        trx,
        createdTicket.id,
        req.user.sub,
        'created',
        null,
        'open'
      );

      return getTicketById(createdTicket.id, trx);
    });

    return res.status(201).json({ ticket: serializeTicket(ticket) });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    return next(error);
  }
}

async function getTickets(req, res, next) {
  try {
    const queue = normalizeString(req.query.queue || 'all').toLowerCase();

    if (!VALID_QUEUES.has(queue)) {
      return res.status(400).json({
        message: 'queue must be one of: all, my, work.',
      });
    }

    if (req.user.role === 'management') {
      return res.status(403).json({
        message: 'You do not have permission to perform this action.',
      });
    }

    const query = baseTicketQuery().orderBy('t.created_at', 'desc');

    if (req.user.role === 'staff') {
      if (queue === 'work') {
        return res.status(200).json({ tickets: [] });
      }

      query.where('t.raised_by', req.user.sub);
    } else if (req.user.role === 'super') {
      if (queue === 'my') {
        query.where('t.raised_by', req.user.sub);
      } else if (queue === 'work') {
        query.whereNot('t.raised_by', req.user.sub);
      }
    } else {
      const isMyQueue = queue === 'my';
      const isWorkQueue = queue === 'work';

      if (isMyQueue) {
        query.where('t.raised_by', req.user.sub);
      } else if (isWorkQueue) {
        query
          .where('t.unit_id', req.user.unitId)
          .where('t.department_id', req.user.departmentId)
          .whereNot('t.raised_by', req.user.sub);
      } else {
        query.where((scope) => {
          scope
            .where('t.raised_by', req.user.sub)
            .orWhere((workQueue) => {
              workQueue
                .where('t.unit_id', req.user.unitId)
                .where('t.department_id', req.user.departmentId)
                .whereNot('t.raised_by', req.user.sub);
            });
        });
      }
    }

    const tickets = await query;
    return res.status(200).json({ tickets: tickets.map(serializeTicket) });
  } catch (error) {
    return next(error);
  }
}

async function getTicket(req, res, next) {
  try {
    const ticket = await getTicketById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    if (!canViewTicket(req.user, ticket)) {
      return res.status(403).json({
        message: 'You are not allowed to view this ticket.',
      });
    }

    const events = await db('ticket_events as te')
      .select(
        'te.id',
        'te.ticket_id',
        'te.actor_id',
        'te.event_type',
        'te.from_value',
        'te.to_value',
        'te.reason',
        'te.resolution_remarks',
        'te.repair_cost',
        'te.created_at',
        'actor_user.username as actor_username',
        'actor_user.full_name as actor_full_name'
      )
      .leftJoin('users as actor_user', 'te.actor_id', 'actor_user.id')
      .where('te.ticket_id', ticket.id)
      .orderBy('te.created_at', 'asc');

    return res.status(200).json({
      ticket: serializeTicket(ticket),
      events: events.map(serializeEvent),
    });
  } catch (error) {
    return next(error);
  }
}

function canClaimTicket(actor, ticket) {
  return (
    (actor.role === 'admin' || actor.role === 'team') &&
    ticket.unit_id === actor.unitId &&
    ticket.department_id === actor.departmentId
  );
}

async function claimTicket(req, res, next) {
  try {
    const ticket = await db.transaction(async (trx) => {
      const currentTicket = await getTicketById(req.params.id, trx);

      if (!currentTicket) {
        throwHttp(404, 'Ticket not found.');
      }

      if (!canClaimTicket(req.user, currentTicket)) {
        throwHttp(403, 'You are not allowed to claim this ticket.');
      }

      if (currentTicket.status !== 'open' || currentTicket.assigned_to) {
        throwHttp(409, 'Only an unassigned open ticket can be claimed.');
      }

      const [updatedTicket] = await trx('tickets')
        .where({ id: currentTicket.id, status: 'open' })
        .whereNull('assigned_to')
        .update({
          assigned_to: req.user.sub,
          status: 'assigned',
        })
        .returning('id');

      if (!updatedTicket) {
        throwHttp(
          409,
          'This ticket was claimed by another user. Refresh and try again.'
        );
      }

      await insertTicketEvent(
        trx,
        currentTicket.id,
        req.user.sub,
        'claimed',
        null,
        req.user.sub
      );

      return getTicketById(currentTicket.id, trx);
    });

    return res.status(200).json({ ticket: serializeTicket(ticket) });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    return next(error);
  }
}

async function findAssignableUser(connection, userId) {
  return connection('users')
    .select('id', 'role', 'unit_id', 'department_id', 'is_active')
    .where('id', userId)
    .first();
}

function isMatchingAdminOrTeam(assignee, ticket) {
  return (
    assignee &&
    assignee.is_active &&
    (assignee.role === 'admin' || assignee.role === 'team') &&
    assignee.unit_id === ticket.unit_id &&
    assignee.department_id === ticket.department_id
  );
}

async function assignTicket(req, res, next) {
  try {
    const assignedTo = (req.body || {}).assignedTo;
    const reason = normalizeString((req.body || {}).reason);

    if (!assignedTo) {
      return res.status(400).json({ message: 'assignedTo is required.' });
    }

    if (req.user.role === 'super' && !reason) {
      return res.status(400).json({
        message: 'reason is required for Super assignment or reassignment.',
      });
    }

    const ticket = await db.transaction(async (trx) => {
      const currentTicket = await getTicketById(req.params.id, trx);

      if (!currentTicket) {
        throwHttp(404, 'Ticket not found.');
      }

      if (currentTicket.status === 'closed' || currentTicket.status === 'resolved') {
        throwHttp(409, 'Resolved or closed tickets cannot be assigned.');
      }

      const assignee = await findAssignableUser(trx, assignedTo);

      if (!assignee || !assignee.is_active) {
        throwHttp(400, 'Assignee not found or inactive.');
      }

      const isInitialAssignment =
        currentTicket.status === 'open' && !currentTicket.assigned_to;
      const isSuperReassignment =
        req.user.role === 'super' &&
        currentTicket.assigned_to &&
        (currentTicket.status === 'assigned' ||
          currentTicket.status === 'in_progress');

      if (req.user.role === 'admin') {
        const isScopedTicket =
          currentTicket.unit_id === req.user.unitId &&
          currentTicket.department_id === req.user.departmentId;

        const isAllowedAssignee =
          assignee.id === req.user.sub ||
          (assignee.role === 'team' &&
            assignee.unit_id === req.user.unitId &&
            assignee.department_id === req.user.departmentId);

        if (!isInitialAssignment || !isScopedTicket || !isAllowedAssignee) {
          throwHttp(
            403,
            'Admins can assign only an unassigned open ticket in their department to themselves or an in-scope Team user.'
          );
        }
      } else if (req.user.role === 'super') {
        if (!isInitialAssignment && !isSuperReassignment) {
          throwHttp(
            409,
            'Super can assign an unassigned open ticket or reassign an assigned or in-progress ticket.'
          );
        }

        if (!isMatchingAdminOrTeam(assignee, currentTicket)) {
          throwHttp(
            400,
            'Super can assign only an active matching Admin or Team user.'
          );
        }

        if (currentTicket.assigned_to === assignee.id) {
          throwHttp(409, 'This ticket is already assigned to that user.');
        }
      } else {
        throwHttp(403, 'You are not allowed to assign tickets.');
      }

      const isReassignment = currentTicket.assigned_to && currentTicket.assigned_to !== assignee.id;

      const updates = { assigned_to: assignee.id };

      if (isInitialAssignment) {
        updates.status = 'assigned';
      }

      if (isReassignment) {
        updates.assignee_has_unread = false;
      }

      const [updatedTicket] = await trx('tickets')
        .where('id', currentTicket.id)
        .where('status', currentTicket.status)
        .where('assigned_to', currentTicket.assigned_to)
        .update(updates)
        .returning('id');

      if (!updatedTicket) {
        throwHttp(
          409,
          'Ticket assignment changed before this action completed. Refresh and try again.'
        );
      }

      await insertTicketEvent(
        trx,
        currentTicket.id,
        req.user.sub,
        isSuperReassignment ? 'reassigned' : 'assigned',
        isSuperReassignment ? currentTicket.assigned_to : null,
        assignee.id,
        req.user.role === 'super' ? reason : null
      );

      return getTicketById(currentTicket.id, trx);
    });

    return res.status(200).json({ ticket: serializeTicket(ticket) });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    return next(error);
  }
}

async function updateTicketPriority(req, res, next) {
  try {
    const priority = normalizeString((req.body || {}).priority).toLowerCase();

    if (!VALID_PRIORITIES.has(priority)) {
      return res.status(400).json({
        message: 'priority must be one of: low, medium, high, urgent.',
      });
    }

    const ticket = await db.transaction(async (trx) => {
      const currentTicket = await getTicketById(req.params.id, trx);

      if (!currentTicket) {
        throwHttp(404, 'Ticket not found.');
      }

      if (currentTicket.status === 'closed') {
        throwHttp(409, 'Closed tickets cannot be changed.');
      }

      const canEdit =
        req.user.role === 'super' ||
        ((req.user.role === 'admin' || req.user.role === 'team') &&
          currentTicket.unit_id === req.user.unitId &&
          currentTicket.department_id === req.user.departmentId);

      if (!canEdit) {
        throwHttp(403, 'You are not allowed to change this ticket priority.');
      }

      await trx('tickets').where('id', currentTicket.id).update({ priority });

      await insertTicketEvent(
        trx,
        currentTicket.id,
        req.user.sub,
        'priority_change',
        currentTicket.priority,
        priority
      );

      return getTicketById(currentTicket.id, trx);
    });

    return res.status(200).json({ ticket: serializeTicket(ticket) });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    return next(error);
  }
}

function isAllowedTransition(currentStatus, nextStatus) {
  return (
    (currentStatus === 'assigned' && nextStatus === 'in_progress') ||
    (currentStatus === 'in_progress' && nextStatus === 'resolved')
  );
}

function canUpdateStatus(actor, ticket) {
  if (actor.role === 'super') {
    return true;
  }

  return (
    (actor.role === 'admin' || actor.role === 'team') &&
    ticket.unit_id === actor.unitId &&
    ticket.department_id === actor.departmentId &&
    ticket.assigned_to === actor.sub
  );
}

async function updateTicketStatus(req, res, next) {
  try {
    const status = normalizeString((req.body || {}).status).toLowerCase();
    const resolutionRemarks = (req.body || {}).resolutionRemarks;
    const repairCost = (req.body || {}).repairCost;

    if (!VALID_STATUSES.has(status)) {
      return res.status(400).json({
        message: 'status must be one of: open, assigned, in_progress, resolved, closed.',
      });
    }

    const ticket = await db.transaction(async (trx) => {
      const currentTicket = await getTicketById(req.params.id, trx);

      if (!currentTicket) {
        throwHttp(404, 'Ticket not found.');
      }

      if (currentTicket.status === 'closed') {
        throwHttp(409, 'Closed tickets cannot be changed.');
      }

      if (!currentTicket.assigned_to) {
        throwHttp(409, 'A ticket must be assigned before its status can be changed.');
      }

      if (!isAllowedTransition(currentTicket.status, status)) {
        throwHttp(
          409,
          `Transition from ${currentTicket.status} to ${status} is not allowed.`
        );
      }

      if (!canUpdateStatus(req.user, currentTicket)) {
        throwHttp(403, 'You are not allowed to change this ticket status.');
      }

      if (status === 'resolved') {
        if (
          typeof resolutionRemarks !== 'string' ||
          resolutionRemarks.trim() === ''
        ) {
          throwHttp(400, 'resolutionRemarks is required when resolving a ticket.');
        }

        if (
          typeof repairCost !== 'number' ||
          repairCost < 0 ||
          !Number.isFinite(repairCost)
        ) {
          throwHttp(400, 'repairCost must be a number >= 0 when resolving a ticket.');
        }
      }

      const updates = { status };

      if (status === 'resolved') {
        updates.resolved_at = trx.fn.now();
        updates.resolution_remarks = resolutionRemarks.trim();
        updates.repair_cost = repairCost;
      }

      await trx('tickets').where('id', currentTicket.id).update(updates);

      await insertTicketEvent(
        trx,
        currentTicket.id,
        req.user.sub,
        'status_change',
        currentTicket.status,
        status,
        null,
        status === 'resolved' ? resolutionRemarks.trim() : null,
        status === 'resolved' ? repairCost : null
      );

      return getTicketById(currentTicket.id, trx);
    });

    return res.status(200).json({ ticket: serializeTicket(ticket) });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    return next(error);
  }
}

async function reopenTicket(req, res, next) {
  try {
    const ticket = await db.transaction(async (trx) => {
      const currentTicket = await getTicketById(req.params.id, trx);

      if (!currentTicket) {
        throwHttp(404, 'Ticket not found.');
      }

      const canReopen =
        req.user.role === 'super' || currentTicket.raised_by === req.user.sub;

      if (!canReopen) {
        throwHttp(403, 'Only Super or the original ticket raiser can reopen this ticket.');
      }

      if (currentTicket.status !== 'resolved' || !currentTicket.resolved_at) {
        throwHttp(409, 'Only resolved tickets can be reopened.');
      }

      if (!currentTicket.assigned_to) {
        throwHttp(409, 'Resolved ticket is missing an assignee.');
      }

      const [updatedTicket] = await trx('tickets')
        .where({
          id: currentTicket.id,
          status: 'resolved',
        })
        .update({
          status: 'in_progress',
          resolved_at: null,
          reopened_count: currentTicket.reopened_count + 1,
        })
        .returning('id');

      if (!updatedTicket) {
        throwHttp(
          409,
          'Ticket status changed before it could be reopened. Refresh and try again.'
        );
      }

      await insertTicketEvent(
        trx,
        currentTicket.id,
        req.user.sub,
        'reopened',
        'resolved',
        'in_progress'
      );

      return getTicketById(updatedTicket.id, trx);
    });

    return res.status(200).json({ ticket: serializeTicket(ticket) });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    return next(error);
  }
}

async function unlockTicket(req, res, next) {
  try {
    const reason = normalizeString((req.body || {}).reason);

    if (!reason) {
      return res.status(400).json({ message: 'reason is required.' });
    }

    const ticket = await db.transaction(async (trx) => {
      const currentTicket = await getTicketById(req.params.id, trx);

      if (!currentTicket) {
        throwHttp(404, 'Ticket not found.');
      }

      if (currentTicket.status !== 'closed') {
        throwHttp(409, 'Only closed tickets can be unlocked.');
      }

      if (!currentTicket.assigned_to) {
        throwHttp(409, 'Closed ticket is missing an assignee.');
      }

      const [updatedTicket] = await trx('tickets')
        .where({
          id: currentTicket.id,
          status: 'closed',
        })
        .update({
          status: 'in_progress',
          closed_at: null,
        })
        .returning('id');

      if (!updatedTicket) {
        throwHttp(
          409,
          'Ticket status changed before it could be unlocked. Refresh and try again.'
        );
      }

      await insertTicketEvent(
        trx,
        currentTicket.id,
        req.user.sub,
        'unlocked',
        'closed',
        'in_progress',
        reason
      );

      return getTicketById(updatedTicket.id, trx);
    });

    return res.status(200).json({ ticket: serializeTicket(ticket) });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    return next(error);
  }
}

async function closeTicket(req, res, next) {
  try {
    const ticket = await db.transaction(async (trx) => {
      const currentTicket = await getTicketById(req.params.id, trx);

      if (!currentTicket) {
        throwHttp(404, 'Ticket not found.');
      }

      const canClose =
        req.user.role === 'super' || currentTicket.raised_by === req.user.sub;

      if (!canClose) {
        throwHttp(403, 'Only Super or the original ticket raiser can manually close this ticket.');
      }

      if (currentTicket.status !== 'resolved') {
        throwHttp(409, 'Only resolved tickets can be manually closed.');
      }

      const [updatedTicket] = await trx('tickets')
        .where({
          id: currentTicket.id,
          status: 'resolved',
        })
        .update({
          status: 'closed',
          closed_at: trx.fn.now(),
        })
        .returning('id');

      if (!updatedTicket) {
        throwHttp(
          409,
          'Ticket status changed before it could be closed. Refresh and try again.'
        );
      }

      await insertTicketEvent(
        trx,
        currentTicket.id,
        req.user.sub,
        'closed',
        'resolved',
        'closed'
      );

      return getTicketById(updatedTicket.id, trx);
    });

    return res.status(200).json({ ticket: serializeTicket(ticket) });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    return next(error);
  }
}

module.exports = {
  createTicket,
  getTickets,
  getTicket,
  claimTicket,
  assignTicket,
  updateTicketPriority,
  updateTicketStatus,
  reopenTicket,
  unlockTicket,
  closeTicket,
};