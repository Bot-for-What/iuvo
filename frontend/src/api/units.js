import { apiRequest } from './client';

export async function getUnits() {
  const response = await apiRequest('/units');
  return response.units || [];
}

export async function createUnit(name, departments = {}) {
  const response = await apiRequest('/units', {
    method: 'POST',
    body: { name, departments },
  });

  return response.unit || response;
}

export async function setUnitActiveState(unitId, isActive) {
  const action = isActive ? 'enable' : 'disable';

  const response = await apiRequest(`/units/${unitId}/${action}`, {
    method: 'PATCH',
  });

  return response.unit || response;
}

export async function setUnitDepartmentActiveState(
  unitId,
  departmentId,
  isActive,
) {
  const action = isActive ? 'enable' : 'disable';

  return apiRequest(`/units/${unitId}/departments/${departmentId}/${action}`, {
    method: 'PATCH',
  });
}