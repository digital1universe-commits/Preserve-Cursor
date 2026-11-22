import type { Permission, Role, RoleId, User } from '../domain/types';

const ALL_PERMS: Permission[] = [
  'incident:create',
  'incident:view',
  'incident:edit',
  'incident:join',
  'roles:manage',
  'users:manage',
  'markings:permanent',
  'markings:service',
  'sert:see_locations',
  'admin:security',
];

export const ROLES: Record<RoleId, Role> = {
  super_admin: {
    id: 'super_admin',
    name: 'Super Admin',
    permissions: [...ALL_PERMS],
  },
  comms: {
    id: 'comms',
    name: 'Comms',
    permissions: ['incident:create', 'incident:view', 'incident:edit', 'incident:join', 'markings:service'],
  },
  supervisor: {
    id: 'supervisor',
    name: 'Shift Supervisor',
    permissions: ['incident:create', 'incident:view', 'incident:edit', 'incident:join', 'markings:service', 'markings:permanent'],
  },
  scene_commander: {
    id: 'scene_commander',
    name: 'Scene Commander',
    permissions: ['incident:create', 'incident:view', 'incident:edit', 'incident:join', 'markings:service'],
  },
  general_duties: {
    id: 'general_duties',
    name: 'General Duties',
    permissions: ['incident:view', 'incident:join'],
  },
  tcs: {
    id: 'tcs',
    name: 'Tactical Crime Scene',
    permissions: ['incident:view', 'incident:join', 'incident:edit'],
  },
  dog_squad: {
    id: 'dog_squad',
    name: 'Dog Squad',
    permissions: ['incident:view', 'incident:join'],
  },
  sert: {
    id: 'sert',
    name: 'SERT',
    permissions: ['incident:view', 'incident:join', 'incident:edit', 'sert:see_locations'],
  },
  event_coordinator: {
    id: 'event_coordinator',
    name: 'Event Coordinator',
    permissions: ['incident:create', 'incident:view', 'incident:edit', 'incident:join', 'markings:service'],
  },
};

export const DEMO_USERS: User[] = [
  {
    id: 'u-admin',
    name: 'Alex Morgan',
    callSign: 'ADMIN-1',
    roleId: 'super_admin',
    unit: 'State Ops',
    isSert: false,
  },
  {
    id: 'u-comms',
    name: 'Sam Nguyen',
    callSign: 'COMMS-12',
    roleId: 'comms',
    unit: 'Brisbane Comms',
    isSert: false,
  },
  {
    id: 'u-sc',
    name: 'Jordan Blake',
    callSign: 'SC-41',
    roleId: 'scene_commander',
    unit: 'North Brisbane',
    isSert: false,
  },
  {
    id: 'u-gd1',
    name: 'Taylor Reid',
    callSign: 'VKR-221',
    roleId: 'general_duties',
    unit: 'Fortitude Valley',
    isSert: false,
  },
  {
    id: 'u-sert1',
    name: 'Casey Holt',
    callSign: 'SERT-3',
    roleId: 'sert',
    unit: 'SERT',
    isSert: true,
  },
  {
    id: 'u-sert2',
    name: 'Riley Quinn',
    callSign: 'SERT-7',
    roleId: 'sert',
    unit: 'SERT',
    isSert: true,
  },
  {
    id: 'u-tcs',
    name: 'Morgan Ellis',
    callSign: 'TCS-2',
    roleId: 'tcs',
    unit: 'TCS',
    isSert: false,
  },
  {
    id: 'u-dog',
    name: 'Avery Shaw',
    callSign: 'DOG-1',
    roleId: 'dog_squad',
    unit: 'Dog Squad',
    isSert: false,
  },
];

export function roleHas(roleId: RoleId, permission: Permission): boolean {
  return ROLES[roleId].permissions.includes(permission);
}

export function userHas(user: User, permission: Permission): boolean {
  return roleHas(user.roleId, permission);
}
