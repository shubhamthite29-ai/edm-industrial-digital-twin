// ==============================================================================
// EDM INDUSTRIAL DIGITAL TWIN — SECURE USER MANAGEMENT EDGE FUNCTION
// Target: Supabase Deno Edge Runtime
// Validates caller's JWT, verifies Administrator/HOD role from database,
// and provisions users using the server-side SUPABASE_SERVICE_ROLE_KEY.
// ==============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestPayload {
  action: "invite_user" | "create_user" | "update_role" | "delete_user";
  email?: string;
  password?: string;
  role?: "administrator" | "hod" | "research";
  displayName?: string;
  department?: string;
  targetUserId?: string;
}

serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid Authorization header." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration missing required environment variables." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Validate caller's JWT using client-scoped Supabase client
    const clientSupabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user: callerUser }, error: callerError } = await clientSupabase.auth.getUser();
    if (callerError || !callerUser) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired authentication token." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Resolve caller's verified role directly from public.user_roles using admin client
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerRoleRow, error: roleError } = await adminSupabase
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUser.id)
      .single();

    if (roleError || !callerRoleRow) {
      return new Response(
        JSON.stringify({ error: "Caller role not found in authorization directory." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerRole = callerRoleRow.role;
    // Both Administrator and HOD possess full management authorization
    if (callerRole !== "administrator" && callerRole !== "hod") {
      return new Response(
        JSON.stringify({ error: "Access denied. Only Administrator and HOD can manage user accounts." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: RequestPayload = await req.json();
    const { action, email, password, role, displayName, department, targetUserId } = body;

    // 4. Dispatch actions
    switch (action) {
      case "invite_user": {
        if (!email || !role) {
          return new Response(
            JSON.stringify({ error: "Parameters 'email' and 'role' are required for invitation." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const cleanEmail = email.trim().toLowerCase();
        const { data: inviteData, error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(cleanEmail, {
          data: { display_name: displayName ?? cleanEmail.split("@")[0] },
        });

        if (inviteError || !inviteData?.user) {
          return new Response(
            JSON.stringify({ error: inviteError?.message ?? "Failed to invite user." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Insert or update role in public.user_roles
        const { error: insertRoleError } = await adminSupabase.from("user_roles").upsert({
          user_id: inviteData.user.id,
          role,
          display_name: displayName ?? cleanEmail.split("@")[0],
          department: department ?? "Mechatronics Engineering",
        });

        if (insertRoleError) {
          return new Response(
            JSON.stringify({ error: insertRoleError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: `Invited ${cleanEmail} with role '${role}'.`, userId: inviteData.user.id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "create_user": {
        if (!email || !password || !role) {
          return new Response(
            JSON.stringify({ error: "Parameters 'email', 'password', and 'role' are required." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const cleanEmail = email.trim().toLowerCase();
        const { data: createData, error: createError } = await adminSupabase.auth.admin.createUser({
          email: cleanEmail,
          password,
          email_confirm: true,
          user_metadata: { display_name: displayName ?? cleanEmail.split("@")[0] },
        });

        if (createError || !createData?.user) {
          return new Response(
            JSON.stringify({ error: createError?.message ?? "Failed to create user." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: roleInsertError } = await adminSupabase.from("user_roles").upsert({
          user_id: createData.user.id,
          role,
          display_name: displayName ?? cleanEmail.split("@")[0],
          department: department ?? "Mechatronics Engineering",
        });

        if (roleInsertError) {
          return new Response(
            JSON.stringify({ error: roleInsertError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: `Created user ${cleanEmail} with role '${role}'.`, userId: createData.user.id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "update_role": {
        if (!targetUserId || !role) {
          return new Response(
            JSON.stringify({ error: "Parameters 'targetUserId' and 'role' are required." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Database trigger prevent_last_administrator_removal automatically enforces safeguard
        const updatePayload: Record<string, unknown> = { role };
        if (displayName) updatePayload.display_name = displayName;
        if (department) updatePayload.department = department;

        const { error: updateError } = await adminSupabase
          .from("user_roles")
          .update(updatePayload)
          .eq("user_id", targetUserId);

        if (updateError) {
          return new Response(
            JSON.stringify({ error: updateError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: `Updated role for user '${targetUserId}' to '${role}'.` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "delete_user": {
        if (!targetUserId) {
          return new Response(
            JSON.stringify({ error: "Parameter 'targetUserId' is required." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Deleting from user_roles first triggers prevent_last_administrator_removal safeguard
        const { error: deleteRoleError } = await adminSupabase
          .from("user_roles")
          .delete()
          .eq("user_id", targetUserId);

        if (deleteRoleError) {
          return new Response(
            JSON.stringify({ error: deleteRoleError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Then delete from auth.users via admin client
        const { error: deleteAuthError } = await adminSupabase.auth.admin.deleteUser(targetUserId);
        if (deleteAuthError) {
          return new Response(
            JSON.stringify({ error: deleteAuthError.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: `User '${targetUserId}' successfully deleted.` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unsupported action: '${action}'.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
