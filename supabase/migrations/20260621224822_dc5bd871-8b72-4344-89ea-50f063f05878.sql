UPDATE public.assessments SET professional_id = NULL WHERE id = '6b94d6f2-6470-4411-b912-872d8174d516' AND professional_id = 'cf28fc55-2cb4-4331-b2db-a2ccea956e5f';
DELETE FROM public.user_roles WHERE user_id = 'cf28fc55-2cb4-4331-b2db-a2ccea956e5f';
DELETE FROM public.trainer_profiles WHERE id = 'cf28fc55-2cb4-4331-b2db-a2ccea956e5f';