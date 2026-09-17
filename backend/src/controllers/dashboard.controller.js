const PDFDocument = require('pdfkit');
const { Parser } = require('json2csv');
const db = require('../db/connection');

const VALID_STATUSES = new Set([
  'open',
  'assigned',
  'in_progress',
  'resolved',
  'closed'
]);

const VALID_PRIORITIES = new Set([
  'low',
  'medium',
  'high',
  'urgent'
]);

const UNRESOLVED_STATUSES = new Set([
  'open',
  'assigned',
  'in_progress'
]);

const ALLOWED_FILTER_KEYS = new Set([
  'unitId',
  'departmentId',
  'status',
  'priority',
  'assigneeId',
  'raisedById',
  'createdFrom',
  'createdTo',
  'resolvedFrom',
  'resolvedTo',
  'closedFrom',
  'closedTo'
]);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalId(value) {
  const normalized = normalizeString(value);

  return normalized || null;
}

function normalizeDate(value, fieldName, endOfDay = false) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return null;
  }

  const dateOnlyMatch = /^\d{4}-\d{2}-\d{2}$/.test(normalized);

  if (dateOnlyMatch) {
    const date = new Date(
      `${normalized}${endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`
    );

    if (Number.isNaN(date.getTime())) {
      const error = new Error(`${fieldName} must be a valid ISO date or timestamp.`);
      error.status = 400;
      throw error;
    }

    return date.toISOString();
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    const error = new Error(`${fieldName} must be a valid ISO date or timestamp.`);
    error.status = 400;
    throw error;
  }

  return date.toISOString();
}

function parseListFilter(value, validValues, fieldName) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  const rawValues = Array.isArray(value)
    ? value
    : String(value).split(',');

  const values = [...new Set(
    rawValues
      .map((item) => normalizeString(item).toLowerCase())
      .filter(Boolean)
  )];

  if (values.some((item) => !validValues.has(item))) {
    const error = new Error(
      `${fieldName} must contain only: ${[...validValues].join(', ')}.`
    );
    error.status = 400;
    throw error;
  }

  return values;
}

function parseDashboardFilters(source = {}) {
  const filters = {
    unitId: normalizeOptionalId(source.unitId),
    departmentId: normalizeOptionalId(source.departmentId),
    status: parseListFilter(source.status, VALID_STATUSES, 'status'),
    priority: parseListFilter(source.priority, VALID_PRIORITIES, 'priority'),
    assigneeId: normalizeOptionalId(source.assigneeId),
    raisedById: normalizeOptionalId(source.raisedById),
    createdFrom: normalizeDate(source.createdFrom, 'createdFrom'),
    createdTo: normalizeDate(source.createdTo, 'createdTo', true),
    resolvedFrom: normalizeDate(source.resolvedFrom, 'resolvedFrom'),
    resolvedTo: normalizeDate(source.resolvedTo, 'resolvedTo', true),
    closedFrom: normalizeDate(source.closedFrom, 'closedFrom'),
    closedTo: normalizeDate(source.closedTo, 'closedTo', true)
  };

  validateDateRange(filters.createdFrom, filters.createdTo, 'createdFrom', 'createdTo');
  validateDateRange(filters.resolvedFrom, filters.resolvedTo, 'resolvedFrom', 'resolvedTo');
  validateDateRange(filters.closedFrom, filters.closedTo, 'closedFrom', 'closedTo');

  return filters;
}

function validateDateRange(fromValue, toValue, fromName, toName) {
  if (fromValue && toValue && new Date(fromValue) > new Date(toValue)) {
    const error = new Error(`${fromName} must not be after ${toName}.`);
    error.status = 400;
    throw error;
  }
}

function sanitizeSavedFilterJson(filterJson) {
  if (!filterJson || typeof filterJson !== 'object' || Array.isArray(filterJson)) {
    const error = new Error('filter must be an object.');
    error.status = 400;
    throw error;
  }

  for (const key of Object.keys(filterJson)) {
    if (!ALLOWED_FILTER_KEYS.has(key)) {
      const error = new Error(`Unsupported filter field: ${key}.`);
      error.status = 400;
      throw error;
    }
  }

  return parseDashboardFilters(filterJson);
}

function serializeFilters(filters) {
  return {
    unitId: filters.unitId,
    departmentId: filters.departmentId,
    status: filters.status,
    priority: filters.priority,
    assigneeId: filters.assigneeId,
    raisedById: filters.raisedById,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    resolvedFrom: filters.resolvedFrom,
    resolvedTo: filters.resolvedTo,
    closedFrom: filters.closedFrom,
    closedTo: filters.closedTo
  };
}

function serializeSavedFilter(savedFilter) {
  return {
    id: savedFilter.id,
    name: savedFilter.name,
    filters: savedFilter.filter_json,
    createdAt: savedFilter.created_at
  };
}

function buildFilteredTicketsQuery(filters, connection = db) {
  const query = connection('tickets as t')
    .join('units as unit', 't.unit_id', 'unit.id')
    .join('departments as department', 't.department_id', 'department.id')
    .join('users as raised_by_user', 't.raised_by', 'raised_by_user.id')
    .leftJoin('users as assigned_to_user', 't.assigned_to', 'assigned_to_user.id');

  if (filters.unitId) {
    query.where('t.unit_id', filters.unitId);
  }

  if (filters.departmentId) {
    query.where('t.department_id', filters.departmentId);
  }

  if (filters.status.length > 0) {
    query.whereIn('t.status', filters.status);
  }

  if (filters.priority.length > 0) {
    query.whereIn('t.priority', filters.priority);
  }

  if (filters.assigneeId) {
    query.where('t.assigned_to', filters.assigneeId);
  }

  if (filters.raisedById) {
    query.where('t.raised_by', filters.raisedById);
  }

  if (filters.createdFrom) {
    query.where('t.created_at', '>=', filters.createdFrom);
  }

  if (filters.createdTo) {
    query.where('t.created_at', '<=', filters.createdTo);
  }

  if (filters.resolvedFrom) {
    query.where('t.resolved_at', '>=', filters.resolvedFrom);
  }

  if (filters.resolvedTo) {
    query.where('t.resolved_at', '<=', filters.resolvedTo);
  }

  if (filters.closedFrom) {
    query.where('t.closed_at', '>=', filters.closedFrom);
  }

  if (filters.closedTo) {
    query.where('t.closed_at', '<=', filters.closedTo);
  }

  return query;
}

async function validateFilterReferences(filters) {
  if (filters.unitId) {
    const unit = await db('units')
      .select('id')
      .where('id', filters.unitId)
      .first();

    if (!unit) {
      const error = new Error('unitId does not reference an existing unit.');
      error.status = 400;
      throw error;
    }
  }

  if (filters.departmentId) {
    const department = await db('departments')
      .select('id')
      .where('id', filters.departmentId)
      .first();

    if (!department) {
      const error = new Error('departmentId does not reference an existing department.');
      error.status = 400;
      throw error;
    }
  }

  const userIds = [
    ['assigneeId', filters.assigneeId],
    ['raisedById', filters.raisedById]
  ];

  for (const [fieldName, userId] of userIds) {
    if (!userId) {
      continue;
    }

    const user = await db('users')
      .select('id')
      .where('id', userId)
      .first();

    if (!user) {
      const error = new Error(`${fieldName} does not reference an existing user.`);
      error.status = 400;
      throw error;
    }
  }
}

async function getFilteredTicketRows(filters) {
  return buildFilteredTicketsQuery(filters)
    .select(
      't.id',
      't.ticket_number',
      't.title',
      't.priority',
      't.status',
      't.created_at',
      't.resolved_at',
      't.closed_at',
      'unit.id as unit_id',
      'unit.name as unit_name',
      'department.id as department_id',
      'department.name as department_name',
      'raised_by_user.id as raised_by_id',
      'raised_by_user.username as raised_by_username',
      'raised_by_user.full_name as raised_by_full_name',
      'assigned_to_user.id as assigned_to_id',
      'assigned_to_user.username as assigned_to_username',
      'assigned_to_user.full_name as assigned_to_full_name'
    )
    .orderBy('t.created_at', 'desc');
}

function serializeTicketForExport(ticket) {
  return {
    ticketNumber: ticket.ticket_number,
    title: ticket.title,
    unit: ticket.unit_name,
    department: ticket.department_name,
    status: ticket.status,
    priority: ticket.priority,
    raisedBy: ticket.raised_by_full_name,
    raisedByUsername: ticket.raised_by_username,
    assignedTo: ticket.assigned_to_full_name || '',
    assignedToUsername: ticket.assigned_to_username || '',
    createdAt: ticket.created_at,
    resolvedAt: ticket.resolved_at || '',
    closedAt: ticket.closed_at || ''
  };
}

function groupCount(rows, keyName, valueSelector) {
  const counts = new Map();

  for (const row of rows) {
    const key = valueSelector(row);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return [...counts.entries()]
    .map(([name, count]) => ({
      [keyName]: name,
      count
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return String(left[keyName]).localeCompare(String(right[keyName]));
    });
}

function getResolutionDurations(rows) {
  return rows
    .filter((ticket) => ticket.resolved_at)
    .map((ticket) => (
      new Date(ticket.resolved_at).getTime() - new Date(ticket.created_at).getTime()
    ))
    .filter((milliseconds) => Number.isFinite(milliseconds) && milliseconds >= 0);
}

function calculateAverageResolutionHours(rows) {
  const durations = getResolutionDurations(rows);

  if (durations.length === 0) {
    return null;
  }

  const totalMilliseconds = durations.reduce(
    (total, milliseconds) => total + milliseconds,
    0
  );

  return Number((totalMilliseconds / durations.length / 3600000).toFixed(2));
}

function makeTrendBucket(ticket) {
  const createdAt = new Date(ticket.created_at);

  return createdAt.toISOString().slice(0, 10);
}

function buildOpenClosedTrend(rows) {
  const buckets = new Map();

  for (const ticket of rows) {
    const date = makeTrendBucket(ticket);

    if (!buckets.has(date)) {
      buckets.set(date, {
        date,
        openedCount: 0,
        closedCount: 0
      });
    }

    buckets.get(date).openedCount += 1;

    if (ticket.status === 'closed') {
      buckets.get(date).closedCount += 1;
    }
  }

  return [...buckets.values()]
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildMetrics(rows) {
  const totalTickets = rows.length;
  const openTickets = rows.filter((ticket) => ticket.status === 'open').length;
  const assignedTickets = rows.filter((ticket) => ticket.status === 'assigned').length;
  const inProgressTickets = rows.filter(
    (ticket) => ticket.status === 'in_progress'
  ).length;
  const resolvedTickets = rows.filter((ticket) => ticket.status === 'resolved').length;
  const closedTickets = rows.filter((ticket) => ticket.status === 'closed').length;

  return {
    summary: {
      totalTickets,
      openTickets,
      assignedTickets,
      inProgressTickets,
      resolvedTickets,
      closedTickets,
      averageResolutionHours: calculateAverageResolutionHours(rows)
    },
    ticketsByStatus: groupCount(rows, 'status', (ticket) => ticket.status),
    ticketsByDepartment: groupCount(
      rows,
      'department',
      (ticket) => ticket.department_name
    ),
    ticketsByUnit: groupCount(rows, 'unit', (ticket) => ticket.unit_name),
    unresolvedTicketsByDepartment: groupCount(
      rows.filter((ticket) => UNRESOLVED_STATUSES.has(ticket.status)),
      'department',
      (ticket) => ticket.department_name
    ),
    ticketsPerTeamMember: groupCount(
      rows,
      'teamMember',
      (ticket) => (
        ticket.assigned_to_full_name
          ? `${ticket.assigned_to_full_name} (${ticket.assigned_to_username})`
          : 'Unassigned'
      )
    ),
    openClosedTrend: buildOpenClosedTrend(rows)
  };
}

function escapePdfText(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function writePdfTable(document, title, rows, columns) {
  if (rows.length === 0) {
    document
      .fontSize(10)
      .fillColor('#555555')
      .text('No matching tickets.');
    return;
  }

  document.fontSize(13).fillColor('#111111').text(title);
  document.moveDown(0.35);

  document.fontSize(8).fillColor('#111111');

  const pageWidth = document.page.width - document.page.margins.left - document.page.margins.right;
  const columnWidth = pageWidth / columns.length;
  const rowHeight = 18;

  const drawHeader = () => {
    const top = document.y;

    columns.forEach((column, index) => {
      document
        .font('Helvetica-Bold')
        .text(column.label, document.page.margins.left + index * columnWidth, top, {
          width: columnWidth - 4,
          height: rowHeight,
          ellipsis: true
        });
    });

    document
      .font('Helvetica')
      .moveTo(document.page.margins.left, top + rowHeight - 3)
      .lineTo(document.page.width - document.page.margins.right, top + rowHeight - 3)
      .strokeColor('#999999')
      .stroke();

    document.y = top + rowHeight;
  };

  drawHeader();

  for (const row of rows) {
    if (document.y + rowHeight > document.page.height - document.page.margins.bottom) {
      document.addPage();
      drawHeader();
    }

    const top = document.y;

    columns.forEach((column, index) => {
      document.text(
        escapePdfText(column.value(row)),
        document.page.margins.left + index * columnWidth,
        top,
        {
          width: columnWidth - 4,
          height: rowHeight,
          ellipsis: true
        }
      );
    });

    document.y = top + rowHeight;
  }
}

function createPdfExport(res, rows, filters) {
  const document = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 36
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    'attachment; filename="dashboard-ticket-export.pdf"'
  );

  document.pipe(res);

  document
    .fontSize(18)
    .fillColor('#111111')
    .text('Service Request Dashboard Export');

  document
    .moveDown(0.3)
    .fontSize(9)
    .fillColor('#555555')
    .text(`Generated at: ${new Date().toISOString()}`)
    .text(`Matching tickets: ${rows.length}`);

  document.moveDown(0.8);

  writePdfTable(document, 'Tickets', rows, [
    {
      label: 'Ticket',
      value: (ticket) => ticket.ticket_number
    },
    {
      label: 'Title',
      value: (ticket) => ticket.title
    },
    {
      label: 'Unit',
      value: (ticket) => ticket.unit_name
    },
    {
      label: 'Department',
      value: (ticket) => ticket.department_name
    },
    {
      label: 'Status',
      value: (ticket) => ticket.status
    },
    {
      label: 'Priority',
      value: (ticket) => ticket.priority
    },
    {
      label: 'Assignee',
      value: (ticket) => ticket.assigned_to_full_name || 'Unassigned'
    },
    {
      label: 'Created',
      value: (ticket) => new Date(ticket.created_at).toISOString().slice(0, 10)
    }
  ]);

  document.end();
}

async function getDashboardMetrics(req, res, next) {
  try {
    const filters = parseDashboardFilters(req.query);
    await validateFilterReferences(filters);

    const rows = await getFilteredTicketRows(filters);

    return res.status(200).json({
      filters: serializeFilters(filters),
      metrics: buildMetrics(rows)
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message
      });
    }

    return next(error);
  }
}

async function exportDashboard(req, res, next) {
  try {
    const format = normalizeString(req.query.format).toLowerCase();

    if (format !== 'csv' && format !== 'pdf') {
      return res.status(400).json({
        message: 'format must be csv or pdf.'
      });
    }

    const filters = parseDashboardFilters(req.query);
    await validateFilterReferences(filters);

    const rows = await getFilteredTicketRows(filters);
    const exportRows = rows.map(serializeTicketForExport);

    if (format === 'csv') {
      const parser = new Parser({
        fields: [
          'ticketNumber',
          'title',
          'unit',
          'department',
          'status',
          'priority',
          'raisedBy',
          'raisedByUsername',
          'assignedTo',
          'assignedToUsername',
          'createdAt',
          'resolvedAt',
          'closedAt'
        ]
      });

      const csv = parser.parse(exportRows);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="dashboard-ticket-export.csv"'
      );

      return res.status(200).send(csv);
    }

    createPdfExport(res, rows, filters);
    return undefined;
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message
      });
    }

    return next(error);
  }
}

async function createSavedFilter(req, res, next) {
  try {
    const name = normalizeString((req.body || {}).name);
    const rawFilters = (req.body || {}).filters;

    if (!name) {
      return res.status(400).json({
        message: 'name is required.'
      });
    }

    if (name.length > 120) {
      return res.status(400).json({
        message: 'name must be 120 characters or fewer.'
      });
    }

    const filters = sanitizeSavedFilterJson(rawFilters);
    await validateFilterReferences(filters);

    const [savedFilter] = await db('saved_filters')
      .insert({
        user_id: req.user.sub,
        name,
        filter_json: JSON.stringify(serializeFilters(filters))
      })
      .returning([
        'id',
        'user_id',
        'name',
        'filter_json',
        'created_at'
      ]);

    return res.status(201).json({
      savedFilter: serializeSavedFilter(savedFilter)
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        message: error.message
      });
    }

    return next(error);
  }
}

async function getSavedFilters(req, res, next) {
  try {
    const savedFilters = await db('saved_filters')
      .select(
        'id',
        'user_id',
        'name',
        'filter_json',
        'created_at'
      )
      .where('user_id', req.user.sub)
      .orderBy('created_at', 'desc');

    return res.status(200).json({
      savedFilters: savedFilters.map(serializeSavedFilter)
    });
  } catch (error) {
    return next(error);
  }
}

async function deleteSavedFilter(req, res, next) {
  try {
    const deletedCount = await db('saved_filters')
      .where({
        id: req.params.id,
        user_id: req.user.sub
      })
      .delete();

    if (deletedCount === 0) {
      return res.status(404).json({
        message: 'Saved filter not found.'
      });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDashboardMetrics,
  exportDashboard,
  createSavedFilter,
  getSavedFilters,
  deleteSavedFilter
};
