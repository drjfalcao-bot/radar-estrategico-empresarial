-- Execute este comando uma única vez depois que o usuário
-- dr.jfalcao@gmail.com solicitar acesso no sistema.

update public.profiles
set
  role = 'admin',
  approval_status = 'approved',
  approved_at = now()
where lower(email) = lower('dr.jfalcao@gmail.com');

-- Conferência
select id, email, full_name, role, approval_status
from public.profiles
where lower(email) = lower('dr.jfalcao@gmail.com');
