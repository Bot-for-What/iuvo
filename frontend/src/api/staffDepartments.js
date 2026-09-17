const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:30040';

export async function getStaffDepartments(unitId, token) {
  const response = await fetch(`${apiBaseUrl}/staff-departments?unitId=${unitId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Unable to load staff departments.');
  }

  const data = await response.json();
  return data.staffDepartments || [];
}
