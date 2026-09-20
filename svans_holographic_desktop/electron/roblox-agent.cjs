"use strict";

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { rankAssets, resolveObjects } = require("./roblox-assets.cjs");
const { generateArchitecturalBuild, generateCastleTownKingdomBuild, generateTownExpansionBuild } = require("./roblox-architecture.cjs");
const BLOCKED_SOURCE = /(?:loadstring\s*\(|HttpService\s*[:.]|require\s*\(\s*\d+\s*\)|InsertService\s*[:.]\s*LoadAsset|MarketplaceService\.ProcessReceipt)/i;
const INSPECTOR_MARKER = "[SVANS_STUDIO_SNAPSHOT]";
const STUDIO_BRIDGE_PORT = 46173;
const STUDIO_BRIDGE_TOKEN = "svans-local-studio-bridge-v1";

const INSPECTOR_SOURCE = `local HttpService = game:GetService("HttpService")
local marker = "${INSPECTOR_MARKER}"
local generation = 0

local function inspect()
    local counts = {}
    local topLevel = {}
    local reusableAssets = {}
    local scripts = {}
    local partCount = 0
    local unanchoredCount = 0
    local transparentCount = 0
    local scriptLines = 0

    for _, instance in ipairs(game:GetDescendants()) do
        counts[instance.ClassName] = (counts[instance.ClassName] or 0) + 1
        if instance:IsA("BasePart") then
            partCount += 1
            if not instance.Anchored then unanchoredCount += 1 end
            if instance.Transparency >= 0.95 then transparentCount += 1 end
        end
        if instance:IsA("LuaSourceContainer") then
            local source = ""
            pcall(function() source = instance.Source end)
            local lines = 0
            for _ in string.gmatch(source, "[^\\n]+") do lines += 1 end
            scriptLines += lines
            if #scripts < 60 then
                table.insert(scripts, { name = instance:GetFullName(), className = instance.ClassName, lines = lines })
            end
        end
    end

    for _, instance in ipairs(workspace:GetChildren()) do
        if #topLevel >= 80 then break end
        table.insert(topLevel, { name = instance.Name, className = instance.ClassName })
    end

    local libraryNames = { ["svans asset library"] = true, ["asset library"] = true, ["assets"] = true, ["building kit"] = true }
    for _, service in ipairs({ game:GetService("ServerStorage"), game:GetService("ReplicatedStorage"), workspace }) do
        for _, candidate in ipairs(service:GetDescendants()) do
            if #reusableAssets >= 100 then break end
            if candidate:IsA("Folder") and libraryNames[string.lower(candidate.Name)] then
                for _, asset in ipairs(candidate:GetChildren()) do
                    if #reusableAssets >= 100 then break end
                    if asset:IsA("Model") or asset:IsA("BasePart") then
                        local partTotal = asset:IsA("BasePart") and 1 or 0
                        local scriptTotal = 0
                        for _, item in ipairs(asset:GetDescendants()) do
                            if item:IsA("BasePart") then partTotal += 1 end
                            if item:IsA("LuaSourceContainer") then scriptTotal += 1 end
                        end
                        local bounds = asset:IsA("BasePart") and asset.Size or asset:GetExtentsSize()
                        table.insert(reusableAssets, { name = asset.Name, path = asset:GetFullName(), className = asset.ClassName, partCount = partTotal, scriptCount = scriptTotal, size = {bounds.X, bounds.Y, bounds.Z}, tags = tostring(asset:GetAttribute("SVANSTags") or ""), library = candidate:GetFullName() })
                    end
                end
            end
        end
    end

    local warnings = {}
    if (counts.SpawnLocation or 0) == 0 then table.insert(warnings, "No SpawnLocation was detected.") end
    if (counts.Script or 0) + (counts.ModuleScript or 0) + (counts.LocalScript or 0) == 0 then table.insert(warnings, "No gameplay scripts were detected.") end
    if (counts.ScreenGui or 0) == 0 then table.insert(warnings, "No ScreenGui interface was detected.") end
    if partCount > 0 and unanchoredCount / partCount > 0.55 then table.insert(warnings, "More than half of the physical parts are unanchored.") end
    if partCount > 12000 then table.insert(warnings, "The place has a high physical-part count and may need performance profiling.") end

    local report = {
        capturedAt = os.time(),
        placeName = game.Name,
        placeId = game.PlaceId,
        universeId = game.GameId,
        totalInstances = #game:GetDescendants(),
        counts = counts,
        partCount = partCount,
        unanchoredCount = unanchoredCount,
        transparentCount = transparentCount,
        scriptLines = scriptLines,
        scripts = scripts,
        topLevel = topLevel,
        reusableAssets = reusableAssets,
        assetCatalogVersion = 1,
        warnings = warnings,
    }
    local encoded = HttpService:JSONEncode(report)
    local chunkSize = 700
    local totalChunks = math.max(1, math.ceil(#encoded / chunkSize))
    local snapshotId = tostring(report.capturedAt) .. "-" .. tostring(math.random(100000, 999999))
    for index = 1, totalChunks do
        local first = ((index - 1) * chunkSize) + 1
        local last = math.min(index * chunkSize, #encoded)
        print(marker .. snapshotId .. "|" .. tostring(index) .. "|" .. tostring(totalChunks) .. "|" .. string.sub(encoded, first, last))
    end
    return report
end

local function scheduleInspection()
    generation += 1
    local current = generation
    task.delay(3, function()
        if current == generation then pcall(inspect) end
    end)
end

task.delay(5, function() pcall(inspect) end)
game.DescendantAdded:Connect(scheduleInspection)
game.DescendantRemoving:Connect(scheduleInspection)

local ChangeHistoryService = game:GetService("ChangeHistoryService")
local Selection = game:GetService("Selection")
local ScriptEditorService = game:GetService("ScriptEditorService")
local AssetService = game:GetService("AssetService")
local bridgeBase = "http://127.0.0.1:${STUDIO_BRIDGE_PORT}"
local bridgeToken = "${STUDIO_BRIDGE_TOKEN}"

local widgetInfo = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 340, 420, 260, 240)
local widget = plugin:CreateDockWidgetPluginGuiAsync("SVANSLiveBuildMonitor", widgetInfo)
widget.Title = "SVANS Live Studio"
local widgetRoot = Instance.new("Frame")
widgetRoot.Size = UDim2.fromScale(1, 1)
widgetRoot.BackgroundColor3 = Color3.fromRGB(4, 18, 27)
widgetRoot.BorderSizePixel = 0
widgetRoot.Parent = widget
local widgetTitle = Instance.new("TextLabel")
widgetTitle.Size = UDim2.new(1, -24, 0, 34)
widgetTitle.Position = UDim2.fromOffset(12, 10)
widgetTitle.BackgroundTransparency = 1
widgetTitle.Text = "SVANS · STANDBY"
widgetTitle.TextColor3 = Color3.fromRGB(101, 233, 255)
widgetTitle.TextXAlignment = Enum.TextXAlignment.Left
widgetTitle.Font = Enum.Font.Code
widgetTitle.TextSize = 16
widgetTitle.Parent = widgetRoot
local widgetDetail = Instance.new("TextLabel")
widgetDetail.Size = UDim2.new(1, -24, 0, 48)
widgetDetail.Position = UDim2.fromOffset(12, 48)
widgetDetail.BackgroundTransparency = 1
widgetDetail.Text = "Waiting for a verified desktop command."
widgetDetail.TextColor3 = Color3.fromRGB(181, 215, 225)
widgetDetail.TextWrapped = true
widgetDetail.TextXAlignment = Enum.TextXAlignment.Left
widgetDetail.TextYAlignment = Enum.TextYAlignment.Top
widgetDetail.Font = Enum.Font.SourceSans
widgetDetail.TextSize = 14
widgetDetail.Parent = widgetRoot
local progressTrack = Instance.new("Frame")
progressTrack.Size = UDim2.new(1, -24, 0, 5)
progressTrack.Position = UDim2.fromOffset(12, 102)
progressTrack.BackgroundColor3 = Color3.fromRGB(18, 57, 70)
progressTrack.BorderSizePixel = 0
progressTrack.Parent = widgetRoot
local progressFill = Instance.new("Frame")
progressFill.Size = UDim2.fromScale(0, 1)
progressFill.BackgroundColor3 = Color3.fromRGB(0, 212, 255)
progressFill.BorderSizePixel = 0
progressFill.Parent = progressTrack
local activityLog = Instance.new("TextLabel")
activityLog.Size = UDim2.new(1, -24, 1, -128)
activityLog.Position = UDim2.fromOffset(12, 118)
activityLog.BackgroundColor3 = Color3.fromRGB(2, 12, 19)
activityLog.BorderColor3 = Color3.fromRGB(15, 73, 88)
activityLog.Text = ""
activityLog.TextColor3 = Color3.fromRGB(147, 204, 217)
activityLog.TextWrapped = true
activityLog.TextXAlignment = Enum.TextXAlignment.Left
activityLog.TextYAlignment = Enum.TextYAlignment.Top
activityLog.Font = Enum.Font.Code
activityLog.TextSize = 12
activityLog.Parent = widgetRoot
local activityLines = {}

local function updateBuildDisplay(title, detail, progress)
    widget.Enabled = true
    widgetTitle.Text = "SVANS · " .. string.upper(title)
    widgetDetail.Text = detail
    progressFill.Size = UDim2.fromScale(math.clamp(progress or 0, 0, 1), 1)
end

local function addBuildActivity(message)
    table.insert(activityLines, os.date("%H:%M:%S") .. "  " .. message)
    while #activityLines > 16 do table.remove(activityLines, 1) end
    activityLog.Text = table.concat(activityLines, "\\n")
end

local function commandIsActive(id)
    local ok, response = pcall(function()
        return HttpService:GetAsync(bridgeBase .. "/active?token=" .. HttpService:UrlEncode(bridgeToken) .. "&id=" .. HttpService:UrlEncode(id), false)
    end)
    return ok and response == "true"
end

local function colorFromHex(value)
    local clean = string.gsub(tostring(value or "#35cceb"), "#", "")
    if #clean ~= 6 then return Color3.fromRGB(53, 204, 235) end
    return Color3.fromRGB(tonumber(string.sub(clean, 1, 2), 16) or 53, tonumber(string.sub(clean, 3, 4), 16) or 204, tonumber(string.sub(clean, 5, 6), 16) or 235)
end

local function vectorFrom(value, fallback)
    if type(value) ~= "table" then return fallback end
    return Vector3.new(tonumber(value[1]) or fallback.X, tonumber(value[2]) or fallback.Y, tonumber(value[3]) or fallback.Z)
end

local function createVisiblePart(data, parent, origin)
    local className = data.shape == "Wedge" and "WedgePart" or data.shape == "CornerWedge" and "CornerWedgePart" or "Part"
    local part = Instance.new(className)
    part.Name = tostring(data.name or "SVANS Part")
    local desiredSize = vectorFrom(data.size, Vector3.new(8, 1, 8))
    if data.shape == "Cylinder" then
        -- SVANS plans cylinder dimensions as width, height, depth. Roblox cylinders
        -- run along local X, so remap and rotate them into the expected upright form.
        part.Size = Vector3.new(desiredSize.Y, desiredSize.X, desiredSize.Z)
    else
        part.Size = desiredSize
    end
    local position = vectorFrom(data.position, Vector3.new()) + (origin or Vector3.new())
    local rotation = vectorFrom(data.rotation, Vector3.new())
    local plannedCFrame = CFrame.new(position) * CFrame.Angles(math.rad(rotation.X), math.rad(rotation.Y), math.rad(rotation.Z))
    part.CFrame = data.shape == "Cylinder" and plannedCFrame * CFrame.Angles(0, 0, math.rad(90)) or plannedCFrame
    if className == "Part" then
        if data.shape == "Ball" then part.Shape = Enum.PartType.Ball elseif data.shape == "Cylinder" then part.Shape = Enum.PartType.Cylinder end
    end
    part.Color = colorFromHex(data.color)
    local material = tostring(data.material or "SmoothPlastic")
    pcall(function() part.Material = Enum.Material[material] end)
    part.Transparency = math.clamp(tonumber(data.transparency) or 0, 0, 1)
    part.CanCollide = data.canCollide ~= false
    part.Anchored = data.anchored ~= false
    part.Parent = parent
    Selection:Set({ part })
    local camera = workspace.CurrentCamera
    if camera then camera.CFrame = CFrame.new(position + Vector3.new(18, 14, 18), position) end
    return part
end

local function createTerrainFeature(data, origin)
    local terrain = workspace.Terrain
    local position = vectorFrom(data.position, Vector3.new()) + (origin or Vector3.new())
    local size = vectorFrom(data.size, Vector3.new(24, 8, 24))
    local rotation = vectorFrom(data.rotation, Vector3.new())
    local material = Enum.Material.Ground
    pcall(function() material = Enum.Material[tostring(data.material or "Ground")] end)
    local kind = tostring(data.kind or "Block")
    if kind == "Ball" then
        terrain:FillBall(position, math.max(2, tonumber(data.radius) or math.max(size.X, size.Y, size.Z) / 2), material)
    elseif kind == "Cylinder" then
        local cframe = CFrame.new(position) * CFrame.Angles(math.rad(rotation.X), math.rad(rotation.Y), math.rad(rotation.Z))
        terrain:FillCylinder(cframe, math.max(2, tonumber(data.height) or size.Y), math.max(2, tonumber(data.radius) or math.max(size.X, size.Z) / 2), material)
    elseif kind == "Wedge" then
        local cframe = CFrame.new(position) * CFrame.Angles(math.rad(rotation.X), math.rad(rotation.Y), math.rad(rotation.Z))
        terrain:FillWedge(cframe, size, material)
    else
        local cframe = CFrame.new(position) * CFrame.Angles(math.rad(rotation.X), math.rad(rotation.Y), math.rad(rotation.Z))
        terrain:FillBlock(cframe, size, material)
    end
    local camera = workspace.CurrentCamera
    if camera then camera.CFrame = CFrame.new(position + Vector3.new(42, 32, 42), position) end
end

local function createVisibleCharacter(data, parent, origin)
    local description = Instance.new("HumanoidDescription")
    local bodyColor = colorFromHex(data.bodyColor or "#c89f7c")
    pcall(function()
        description.HeadColor = bodyColor
        description.LeftArmColor = bodyColor
        description.RightArmColor = bodyColor
        description.LeftLegColor = bodyColor
        description.RightLegColor = bodyColor
        description.TorsoColor = colorFromHex(data.torsoColor or data.bodyColor or "#456b8a")
        description.HeightScale = math.clamp(tonumber(data.heightScale) or 1, 0.8, 1.2)
        description.WidthScale = math.clamp(tonumber(data.widthScale) or 1, 0.7, 1.3)
        description.BodyTypeScale = math.clamp(tonumber(data.bodyTypeScale) or 0.35, 0, 1)
    end)
    local model = game:GetService("Players"):CreateHumanoidModelFromDescriptionAsync(description, Enum.HumanoidRigType.R15)
    model.Name = tostring(data.name or "SVANS Character")
    model:SetAttribute("SVANSRole", tostring(data.role or "NPC"))
    model:SetAttribute("SVANSDialogue", tostring(data.dialogue or "Welcome to Elemental Realms."))
    model:SetAttribute("SVANSElement", tostring(data.element or "Neutral"))
    model.Parent = parent
    local position = vectorFrom(data.position, Vector3.new()) + (origin or Vector3.new())
    local standingPosition = position + Vector3.new(0, 3, 0)
    model:PivotTo(CFrame.new(standingPosition))
    local humanoid = model:FindFirstChildOfClass("Humanoid")
    if humanoid then
        humanoid.DisplayName = tostring(data.displayName or data.name or "SVANS Character")
        humanoid.WalkSpeed = math.clamp(tonumber(data.walkSpeed) or 10, 0, 40)
        humanoid.MaxHealth = math.clamp(tonumber(data.health) or 100, 1, 10000)
        humanoid.Health = humanoid.MaxHealth
    end
    local head = model:FindFirstChild("Head")
    if head then
        local prompt = Instance.new("ProximityPrompt")
        prompt.Name = "SVANSDialoguePrompt"
        prompt.ActionText = "Speak"
        prompt.ObjectText = tostring(data.displayName or data.name or "Mentor")
        prompt.MaxActivationDistance = 12
        prompt.Parent = head
    end
    Selection:Set({ model })
    local camera = workspace.CurrentCamera
    if camera then camera.CFrame = CFrame.new(standingPosition + Vector3.new(12, 8, 12), standingPosition) end
    return model
end

local function stripExecutableContent(root)
    for _, descendant in ipairs(root:GetDescendants()) do
        if descendant:IsA("LuaSourceContainer") or descendant:IsA("PackageLink") then descendant:Destroy() end
    end
end

local function findReusableTemplate(data)
    local wanted = string.lower(tostring(data.template or data.name or ""))
    local role = string.lower(tostring(data.role or ""))
    local libraryNames = { ["svans asset library"] = true, ["asset library"] = true, ["assets"] = true, ["building kit"] = true }
    local exact = nil
    for _, service in ipairs({ game:GetService("ServerStorage"), game:GetService("ReplicatedStorage"), workspace }) do
        for _, candidate in ipairs(service:GetDescendants()) do
            if candidate:IsA("Folder") and libraryNames[string.lower(candidate.Name)] then
                for _, asset in ipairs(candidate:GetChildren()) do
                    if asset:IsA("Model") or asset:IsA("BasePart") then
                        local assetName = string.lower(asset.Name)
                        if data.templatePath and data.templatePath ~= "" then
                            if asset:GetFullName() == data.templatePath then return asset end
                        elseif wanted ~= "" and assetName == wanted then
                            if exact then return nil end
                            exact = asset
                        end
                    end
                end
            end
        end
    end
    return exact
end

local function createReusableObject(data, parent, origin)
    local object = nil
    local source = ""
    local assetId = tonumber(data.assetId) or 0
    if assetId > 0 then
        local loadedOk, loaded = pcall(function() return AssetService:LoadAssetAsync(assetId) end)
        if loadedOk and loaded then
            object = loaded
            source = "approved inventory asset " .. tostring(assetId)
        end
    end
    if not object then
        local template = findReusableTemplate(data)
        if template then
            object = template:Clone()
            source = "library object " .. template.Name
        end
    end
    if not object then return nil, "no matching approved object" end
    stripExecutableContent(object)
    object.Name = tostring(data.name or data.template or "SVANS Reusable Object")
    for _, descendant in ipairs(object:GetDescendants()) do
        if descendant:IsA("BasePart") then descendant.Anchored = true end
    end
    if object:IsA("BasePart") then object.Anchored = true end
    object.Parent = parent
    local scale = math.clamp(tonumber(data.scale) or 1, 0.1, 20)
    pcall(function()
        if object:IsA("Model") then object:ScaleTo(object:GetScale() * scale) elseif object:IsA("BasePart") then object.Size = object.Size * scale end
    end)
    local position = vectorFrom(data.position, Vector3.new()) + (origin or Vector3.new())
    local rotation = vectorFrom(data.rotation, Vector3.new())
    object:PivotTo(CFrame.new(position) * CFrame.Angles(math.rad(rotation.X), math.rad(rotation.Y), math.rad(rotation.Z)))
    Selection:Set({ object })
    local camera = workspace.CurrentCamera
    if camera then camera.CFrame = CFrame.new(position + Vector3.new(16, 12, 16), position) end
    return object, source
end

local function findBuildOrigin()
    local camera = workspace.CurrentCamera
    if not camera then return Vector3.new() end
    local focus = camera.Focus.Position
    local params = RaycastParams.new()
    params.FilterType = Enum.RaycastFilterType.Exclude
    params.IgnoreWater = true
    local result = workspace:Raycast(focus + Vector3.new(0, 768, 0), Vector3.new(0, -1536, 0), params)
    if result then return Vector3.new(focus.X, result.Position.Y + 2, focus.Z) end
    return focus
end

local function containerBounds(container)
    local minimum, maximum = nil, nil
    for _, descendant in ipairs(container:GetDescendants()) do
        if descendant:IsA("BasePart") then
            local half = descendant.Size / 2
            local low, high = descendant.Position - half, descendant.Position + half
            minimum = minimum and Vector3.new(math.min(minimum.X, low.X), math.min(minimum.Y, low.Y), math.min(minimum.Z, low.Z)) or low
            maximum = maximum and Vector3.new(math.max(maximum.X, high.X), math.max(maximum.Y, high.Y), math.max(maximum.Z, high.Z)) or high
        end
    end
    if not minimum or not maximum then return false, CFrame.new(), Vector3.new() end
    local size = maximum - minimum
    return true, CFrame.new((minimum + maximum) / 2), size
end

local function findLatestSvansBuildOrigin()
    local latest, latestTime = nil, -math.huge
    for _, child in ipairs(workspace:GetChildren()) do
        if child:IsA("Folder") and (child:GetAttribute("SVANSBuild") == true or string.match(child.Name, "^SVANS Build %-")) then
            local created = tonumber(child:GetAttribute("SVANSBuildCreatedAt")) or 0
            if created >= latestTime then latest, latestTime = child, created end
        end
    end
    if latest then
        local ok, boundsCFrame, boundsSize = containerBounds(latest)
        if ok then return Vector3.new(boundsCFrame.Position.X, boundsCFrame.Position.Y - boundsSize.Y / 2, boundsCFrame.Position.Z) end
    end
    return findBuildOrigin()
end

local function buildVisibleContent(command)
    local spec = command.payload and command.payload.spec or {}
    local name = tostring(spec.name or "Live Build")
    local worldParts = type(spec.parts) == "table" and spec.parts or {}
    local buildings = type(spec.buildings) == "table" and spec.buildings or {}
    local terrainFeatures = type(spec.terrain) == "table" and spec.terrain or {}
    local characters = type(spec.characters) == "table" and spec.characters or {}
    local reusableObjects = type(spec.objects) == "table" and spec.objects or {}
    local scripts = type(spec.scripts) == "table" and spec.scripts or {}
    local cameraChecks = type(spec.cameraChecks) == "table" and spec.cameraChecks or {}
    local total = #worldParts + #terrainFeatures + #characters + #reusableObjects + #scripts
    for _, building in ipairs(buildings) do total += type(building.parts) == "table" and #building.parts or 0 end
    total = math.max(total, 1)
    local complete = 0
    local createdParts = 0
    local createdScripts = 0
    local verifiedScriptCharacters = 0
    local verifiedScriptLines = 0
    local createdTerrain = 0
    local createdCharacters = 0
    local createdObjects = 0
    local skippedObjects = 0
    local buildOrigin = spec.relativePlacement == false and Vector3.new() or (spec.placementMode == "around_latest_svans_build" and findLatestSvansBuildOrigin() or findBuildOrigin())
    local function advance(label)
        complete += 1
        updateBuildDisplay("Building", label, complete / total)
        addBuildActivity(label)
        if complete % 8 == 0 and not commandIsActive(command.id) then error("SVANS live build stopped by owner.") end
        task.wait(0.09)
    end

    ChangeHistoryService:SetWaypoint("Before SVANS visible build")
    local buildFolder = Instance.new("Folder")
    buildFolder.Name = "SVANS Build - " .. name
    buildFolder:SetAttribute("SVANSBuild", true)
    buildFolder:SetAttribute("SVANSBuildCreatedAt", os.time())
    buildFolder.Parent = workspace
    widget.Enabled = true
    activityLines = {}
    updateBuildDisplay("Starting", "Preparing " .. name .. " inside " .. game.Name, 0)
    addBuildActivity("Verified target: " .. game.Name)
    addBuildActivity("Ground anchor: " .. string.format("%.1f, %.1f, %.1f", buildOrigin.X, buildOrigin.Y, buildOrigin.Z))

    local lightingData = type(spec.lighting) == "table" and spec.lighting or nil
    if lightingData then
        local lighting = game:GetService("Lighting")
        lighting.Brightness = math.clamp(tonumber(lightingData.brightness) or lighting.Brightness, 0, 10)
        lighting.ClockTime = math.clamp(tonumber(lightingData.clockTime) or lighting.ClockTime, 0, 24)
        lighting.FogEnd = math.clamp(tonumber(lightingData.fogEnd) or lighting.FogEnd, 0, 100000)
        if lightingData.globalShadows ~= nil then lighting.GlobalShadows = lightingData.globalShadows ~= false end
        pcall(function() lighting.Ambient = colorFromHex(lightingData.ambient) end)
        pcall(function() lighting.OutdoorAmbient = colorFromHex(lightingData.outdoorAmbient) end)
        addBuildActivity("Updated atmospheric lighting")
    end

    for _, data in ipairs(terrainFeatures) do
        createTerrainFeature(data, buildOrigin)
        createdTerrain += 1
        advance("Shaped terrain · " .. tostring(data.name or data.kind or "Feature"))
    end

    for _, data in ipairs(worldParts) do
        createVisiblePart(data, buildFolder, buildOrigin)
        createdParts += 1
        advance("Created object · " .. tostring(data.name or "Part"))
    end
    for _, building in ipairs(buildings) do
        local model = Instance.new("Model")
        model.Name = tostring(building.name or "SVANS Building")
        model.Parent = buildFolder
        for _, data in ipairs(type(building.parts) == "table" and building.parts or {}) do
            createVisiblePart(data, model, buildOrigin)
            createdParts += 1
            advance("Built " .. model.Name .. " · " .. tostring(data.name or "Part"))
        end
    end
    local objectFolder = Instance.new("Folder")
    objectFolder.Name = "Reusable Objects"
    objectFolder.Parent = buildFolder
    for _, data in ipairs(reusableObjects) do
        local object, source = createReusableObject(data, objectFolder, buildOrigin)
        if object then
            createdObjects += 1
            advance("Placed object · " .. tostring(data.name or data.template or "Object") .. " · " .. source)
        else
            skippedObjects += 1
            advance("Skipped object · " .. tostring(data.template or data.role or "unmatched") .. " · " .. source)
        end
    end
    local characterFolder = Instance.new("Folder")
    characterFolder.Name = "Characters"
    characterFolder.Parent = buildFolder
    for _, data in ipairs(characters) do
        createVisibleCharacter(data, characterFolder, buildOrigin)
        createdCharacters += 1
        advance("Created character · " .. tostring(data.displayName or data.name or "NPC"))
    end
    for _, data in ipairs(scripts) do
        local className = data.className == "LocalScript" and "LocalScript" or data.className == "ModuleScript" and "ModuleScript" or "Script"
        local container = data.container == "StarterPlayerScripts" and game:GetService("StarterPlayer"):WaitForChild("StarterPlayerScripts") or game:GetService("ServerScriptService")
        local requestedName = tostring(data.name or "SVANS Script")
        local scriptObject = spec.updateExistingScripts == true and container:FindFirstChild(requestedName) or nil
        if scriptObject and scriptObject.ClassName ~= className then scriptObject = nil end
        if not scriptObject then
            scriptObject = Instance.new(className)
            scriptObject.Name = requestedName
            scriptObject.Parent = container
        else
            addBuildActivity("Updating existing script · " .. requestedName)
        end
        if scriptObject:IsA("BaseScript") then scriptObject.Enabled = false end
        Selection:Set({ scriptObject })
        local source = tostring(data.source or "")
        local initial = "-- SVANS is writing " .. scriptObject.Name .. "..."
        local initialOk, initialError = pcall(function()
            ScriptEditorService:UpdateSourceAsync(scriptObject, function() return initial end)
        end)
        if not initialOk then error("Could not prepare " .. scriptObject.Name .. ": " .. tostring(initialError)) end
        local openOk, openResult, openError = pcall(function()
            return ScriptEditorService:OpenScriptDocumentAsync(scriptObject, { Temporary = false })
        end)
        if not openOk or openResult == false then error("Could not open " .. scriptObject.Name .. " in the Script Editor: " .. tostring(openError)) end
        local cursor = 0
        while cursor < #source do
            cursor = math.min(#source, cursor + 36)
            local visibleChunk = string.sub(source, 1, cursor)
            local updateOk, updateError = pcall(function()
                ScriptEditorService:UpdateSourceAsync(scriptObject, function() return visibleChunk end)
            end)
            if not updateOk then error("Studio stopped writing " .. scriptObject.Name .. ": " .. tostring(updateError)) end
            updateBuildDisplay("Writing code", scriptObject.Name .. " · " .. tostring(cursor) .. "/" .. tostring(#source) .. " characters", (complete + (cursor / math.max(#source, 1))) / total)
            if cursor % 360 == 0 and not commandIsActive(command.id) then error("SVANS live build stopped by owner.") end
            task.wait(0.045)
        end
        local finalOk, finalError = pcall(function()
            ScriptEditorService:UpdateSourceAsync(scriptObject, function() return source end)
        end)
        if not finalOk then error("Studio could not finalize " .. scriptObject.Name .. ": " .. tostring(finalError)) end
        local verifyOk, editorSource = pcall(function() return ScriptEditorService:GetEditorSource(scriptObject) end)
        if not verifyOk or editorSource ~= source then
            error("Studio did not verify the complete source for " .. scriptObject.Name .. " (expected " .. tostring(#source) .. " characters, found " .. tostring(verifyOk and #editorSource or 0) .. ").")
        end
        if scriptObject:IsA("BaseScript") then scriptObject.Enabled = true end
        createdScripts += 1
        verifiedScriptCharacters += #source
        verifiedScriptLines += source == "" and 0 or #string.split(source, string.char(10))
        advance("Verified script · " .. scriptObject.Name .. " · " .. tostring(#source) .. " characters")
    end
    local focusOk, boundsCFrame, boundsSize = containerBounds(buildFolder)
    if focusOk then
        Selection:Set({ buildFolder })
        local camera = workspace.CurrentCamera
        if camera then
            local review = cameraChecks[1]
            if type(review) == "table" then
                local position = vectorFrom(review.position, Vector3.new(0, 8, 70)) + buildOrigin
                local target = vectorFrom(review.target, Vector3.new(0, 8, 0)) + buildOrigin
                camera.CFrame = CFrame.new(position, target)
                addBuildActivity("Ground-level review camera · " .. tostring(review.name or "entrance"))
            else
                local distance = math.max(boundsSize.X, boundsSize.Y, boundsSize.Z, 45) * 0.9
                local target = boundsCFrame.Position
                camera.CFrame = CFrame.new(target + Vector3.new(distance, distance * 0.62, distance), target)
            end
        end
    end
    ChangeHistoryService:SetWaypoint("SVANS visible build complete")
    scheduleInspection()
    updateBuildDisplay("Complete", name .. " is ready for review. Nothing was published.", 1)
    addBuildActivity("Build complete · review, test, then save when ready")
    print("[SVANS_STUDIO_ACTION] Visible build complete: " .. name .. " · " .. tostring(createdParts) .. " parts · " .. tostring(createdScripts) .. " scripts")
    return { ok = true, name = name, createdParts = createdParts, createdTerrain = createdTerrain, createdCharacters = createdCharacters, createdObjects = createdObjects, skippedObjects = skippedObjects, createdScripts = createdScripts, verifiedScriptCharacters = verifiedScriptCharacters, verifiedScriptLines = verifiedScriptLines, validatedCameraViews = #cameraChecks, undoAvailable = true }
end

local function isProtectedDynamicPart(part)
    if part:GetAttribute("SVANSKeepDynamic") == true then return true end
    local name = string.lower(part.Name)
    if string.find(name, "door") or string.find(name, "gate") or string.find(name, "projectile") or string.find(name, "vehicle") or string.find(name, "wheel") or string.find(name, "elevator") or string.find(name, "moving") then return true end
    local current = part.Parent
    while current and current ~= workspace do
        if current:IsA("Tool") or current:FindFirstChildOfClass("Humanoid") then return true end
        local currentName = string.lower(current.Name)
        if string.find(currentName, "vfx") or string.find(currentName, "effect") or string.find(currentName, "projectile") or string.find(currentName, "vehicle") then return true end
        current = current.Parent
    end
    return false
end

local function applySafePerformanceFixes()
    ChangeHistoryService:SetWaypoint("Before SVANS performance fixes")
    local anchored = 0
    local alreadyAnchored = 0
    for _, instance in ipairs(workspace:GetDescendants()) do
        if instance:IsA("BasePart") then
            if instance.Anchored then
                alreadyAnchored += 1
            elseif not isProtectedDynamicPart(instance) then
                instance.Anchored = true
                anchored += 1
            end
        end
    end
    local streamingChanged = workspace.StreamingEnabled ~= true
    workspace.StreamingEnabled = true
    ChangeHistoryService:SetWaypoint("SVANS performance fixes applied")
    scheduleInspection()
    return { ok = true, anchored = anchored, alreadyAnchored = alreadyAnchored, streamingEnabled = workspace.StreamingEnabled, streamingChanged = streamingChanged }
end

local function executeBridgeCommand(command)
    if command.type == "ping" then return { ok = true, placeName = game.Name, placeId = game.PlaceId, universeId = game.GameId, isRunning = game:GetService("RunService"):IsRunning(), bridgeVersion = 9 } end
    if command.type == "inspect" then return { ok = true, snapshot = inspect() } end
    if command.type == "safe_performance_fix" then return applySafePerformanceFixes() end
    if command.type == "visible_live_build" then return buildVisibleContent(command) end
    return { ok = false, error = "Unsupported Studio command." }
end

task.spawn(function()
    local bridgeAnnounced = false
    while task.wait(0.8) do
        local ok, response = pcall(function()
            return HttpService:GetAsync(bridgeBase .. "/next?token=" .. HttpService:UrlEncode(bridgeToken) .. "&place=" .. HttpService:UrlEncode(game.Name) .. "&placeId=" .. tostring(game.PlaceId) .. "&universeId=" .. tostring(game.GameId), false)
        end)
        if ok and not bridgeAnnounced then
            bridgeAnnounced = true
            print("[SVANS_STUDIO_BRIDGE] Connected for " .. game.Name)
        end
        if ok and response and response ~= "" then
            local decodedOk, command = pcall(function() return HttpService:JSONDecode(response) end)
            if decodedOk and command and command.id then
                local resultOk, result = pcall(executeBridgeCommand, command)
                if not resultOk then result = { ok = false, error = tostring(result) } end
                result.id = command.id
                pcall(function()
                    HttpService:PostAsync(bridgeBase .. "/result?token=" .. HttpService:UrlEncode(bridgeToken), HttpService:JSONEncode(result), Enum.HttpContentType.ApplicationJson, false)
                end)
            end
        end
    end
end)`;

function inspectorPluginXml() {
  return `<?xml version="1.0" encoding="utf-8"?><roblox version="4"><Item class="Script" referent="RBX_SVANS_INSPECTOR"><Properties><string name="Name">SVANS Studio Inspector</string><ProtectedString name="Source"><![CDATA[${cdata(INSPECTOR_SOURCE)}]]></ProtectedString></Properties></Item></roblox>`;
}

function clamp(value, minimum, maximum, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function studioLaunchDecision(context) {
  return context?.running || context?.sessions?.length ? "reuse" : "launch";
}

function classifyStudioWindow(windowTitle, processId = null) {
  const title = String(windowTitle || "").trim();
  const fileMatch = title.match(/([^\\/:*?"<>|]+\.rbxlx?)(?=\s+-|$)/i);
  const fileName = fileMatch?.[1]?.trim() || null;
  const playtesting = /(?:^|\s[-·]\s)(?:test|play|client|server)(?:\s[-·]|$)/i.test(title);
  const unsaved = !fileName && /\b(?:untitled|baseplate)\b/i.test(title) && !/^roblox studio$/i.test(title);
  const unsavedName = unsaved ? title.split(/\s+-\s+/)[0].trim() : null;
  const projectName = fileName ? path.basename(fileName, path.extname(fileName)) : unsavedName;
  const state = playtesting ? "playtest" : fileName ? "place" : unsaved ? "unsaved" : "home";
  return { processId: Number(processId) || null, windowTitle: title, state, projectName, fileName, playtesting, saved: Boolean(fileName) };
}

function rankRecentProjects(recentProjects, query) {
  const wanted = normalizedAppText(query);
  return (Array.isArray(recentProjects) ? recentProjects : []).map((project, index) => {
    const name = normalizedAppText(project?.name);
    const fileName = normalizedAppText(path.basename(String(project?.path || ""), path.extname(String(project?.path || ""))));
    const candidate = name || fileName;
    const tokens = candidate.split(" ").filter((token) => token.length > 1);
    const tokenMatches = tokens.filter((token) => wanted.includes(token)).length;
    const exact = candidate && (wanted === candidate || wanted.includes(candidate));
    return { project, score: exact ? 1000 : tokenMatches * 100 - index };
  }).filter((entry) => entry.project?.name && entry.project?.path).sort((left, right) => right.score - left.score);
}

function selectStudioSession(sessions, query = "", preferredProject = "") {
  const available = Array.isArray(sessions) ? sessions : [];
  if (!available.length) return null;
  const wanted = normalizedAppText(query);
  const preferred = normalizedAppText(preferredProject);
  const score = (session, index) => {
    const project = normalizedAppText(session?.projectName || session?.fileName || "");
    let value = -index;
    if (project && wanted.includes(project)) value += 2000;
    if (project && preferred && project === preferred) value += 900;
    if (session?.state === "place") value += 300;
    if (session?.state === "unsaved") value += 100;
    if (session?.state === "playtest") value -= 500;
    return value;
  };
  return available.map((session, index) => ({ session, score: score(session, index) })).sort((left, right) => right.score - left.score)[0]?.session || null;
}

function xml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cdata(value) {
  return String(value ?? "").replace(/]]>/g, "]]]]><![CDATA[>");
}

function slug(value) {
  return String(value || "Roblox Game").replace(/[^a-z0-9 _-]/gi, "").trim().replace(/\s+/g, "-").slice(0, 54) || "roblox-game";
}

function normalizedAppText(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function parseColor(value) {
  const match = String(value || "").match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  const rgb = match ? (parseInt(match[1], 16) << 16) | (parseInt(match[2], 16) << 8) | parseInt(match[3], 16) : 0x24a9d8;
  return (0xff000000 | rgb) >>> 0;
}

function vector(value, fallback = [0, 0, 0]) {
  const source = Array.isArray(value) ? value : fallback;
  return [0, 1, 2].map((index) => clamp(source[index], -10000, 10000, fallback[index] || 0));
}

function rotationMatrix(rotation) {
  const [x, y, z] = vector(rotation).map((degrees) => degrees * Math.PI / 180);
  const cx = Math.cos(x); const sx = Math.sin(x);
  const cy = Math.cos(y); const sy = Math.sin(y);
  const cz = Math.cos(z); const sz = Math.sin(z);
  return [
    cy * cz, cz * sx * sy - cx * sz, sx * sz + cx * cz * sy,
    cy * sz, cx * cz + sx * sy * sz, cx * sy * sz - cz * sx,
    -sy, cy * sx, cx * cy,
  ];
}

function coordinateFrame(name, position, rotation = [0, 0, 0]) {
  const [x, y, z] = vector(position);
  const matrix = rotationMatrix(rotation);
  return `<CoordinateFrame name="${name}"><X>${x}</X><Y>${y}</Y><Z>${z}</Z>${matrix.map((value, index) => `<R${Math.floor(index / 3)}${index % 3}>${Number(value.toFixed(8))}</R${Math.floor(index / 3)}${index % 3}>`).join("")}</CoordinateFrame>`;
}

function referencePrefix(value) {
  return String(value || "OBJECT").replace(/[^a-z0-9_]/gi, "_").toUpperCase().slice(0, 52);
}

const MATERIAL_TOKENS = Object.freeze({ Plastic: 256, SmoothPlastic: 272, Neon: 288, Wood: 512, WoodPlanks: 528, Slate: 800, Concrete: 816, Brick: 848, Metal: 1088, Grass: 1280, Sand: 1296, Glass: 1568 });

function partXml(part, index, prefix = "PART") {
  const size = Array.isArray(part.size) ? part.size : [12, 1, 12];
  const position = Array.isArray(part.position) ? part.position : [0, 0, 0];
  const material = MATERIAL_TOKENS[part.material] || MATERIAL_TOKENS.SmoothPlastic;
  const requestedShape = String(part.shape || "Block").toLowerCase();
  const className = /spawn/i.test(String(part.name || "")) ? "SpawnLocation" : requestedShape === "wedge" ? "WedgePart" : requestedShape === "cornerwedge" ? "CornerWedgePart" : "Part";
  const shapeToken = requestedShape === "ball" || requestedShape === "sphere" ? 0 : requestedShape === "cylinder" ? 2 : 1;
  const referent = `RBX_${referencePrefix(prefix)}_${index}`;
  return `<Item class="${className}" referent="${referent}"><Properties>
    <string name="Name">${xml(String(part.name || `Part ${index + 1}`).slice(0, 80))}</string>
    <bool name="Anchored">${part.anchored === false ? "false" : "true"}</bool><bool name="CanCollide">${part.canCollide === false ? "false" : "true"}</bool><bool name="CastShadow">${part.castShadow === false ? "false" : "true"}</bool>
    <token name="Material">${material}</token><Color3uint8 name="Color3uint8">${parseColor(part.color)}</Color3uint8>
    ${className === "Part" ? `<token name="shape">${shapeToken}</token>` : ""}<float name="Transparency">${clamp(part.transparency, 0, 1, 0)}</float><float name="Reflectance">${clamp(part.reflectance, 0, 1, 0)}</float>
    <Vector3 name="size"><X>${clamp(size[0], 0.2, 2048, 12)}</X><Y>${clamp(size[1], 0.2, 2048, 1)}</Y><Z>${clamp(size[2], 0.2, 2048, 12)}</Z></Vector3>
    ${coordinateFrame("CFrame", position, part.rotation)}
  </Properties></Item>`;
}

function modelXml(model, index) {
  const name = String(model?.name || `Building ${index + 1}`).slice(0, 80);
  const prefix = `MODEL_${index}_${referencePrefix(name)}`;
  const parts = (Array.isArray(model?.parts) ? model.parts : []).slice(0, 80);
  return `<Item class="Model" referent="RBX_${prefix}"><Properties><string name="Name">${xml(name)}</string></Properties>${parts.map((part, partIndex) => partXml(part, partIndex, prefix)).join("")}</Item>`;
}

function motorXml(name, referent, part0, part1, c0, c1) {
  return `<Item class="Motor6D" referent="${referent}"><Properties><string name="Name">${xml(name)}</string><Ref name="Part0">${part0}</Ref><Ref name="Part1">${part1}</Ref>${coordinateFrame("C0", c0)}${coordinateFrame("C1", c1)}</Properties></Item>`;
}

function npcBehaviorSource(character) {
  const radius = clamp(character?.wanderRadius, 4, 120, 18);
  const dialogue = String(character?.dialogue || "Welcome. The world is ready for you.").replace(/[\r\n]+/g, " ").slice(0, 180);
  return `local character = script.Parent
local humanoid = character:WaitForChild("Humanoid")
local root = character:WaitForChild("HumanoidRootPart")
local origin = root.Position
character:SetAttribute("SVANSDialogue", ${JSON.stringify(dialogue)})

while humanoid.Health > 0 do
    task.wait(math.random(2, 5))
    local offset = Vector3.new(math.random(-${Math.round(radius)}, ${Math.round(radius)}), 0, math.random(-${Math.round(radius)}, ${Math.round(radius)}))
    humanoid:MoveTo(origin + offset)
end`;
}

function characterXml(character, index) {
  const name = String(character?.name || `Character ${index + 1}`).slice(0, 60);
  const prefix = `NPC_${index}_${referencePrefix(name)}`;
  const refs = Object.fromEntries(["Root", "Torso", "Head", "LeftArm", "RightArm", "LeftLeg", "RightLeg"].map((part) => [part, `RBX_${prefix}_${part.toUpperCase()}`]));
  const [x, floorY, z] = vector(character?.position, [0, 1, 0]);
  const bodyColor = character?.bodyColor || "#d7b58d";
  const shirtColor = character?.shirtColor || "#267fa4";
  const pantsColor = character?.pantsColor || "#263c67";
  const bodyParts = [
    { key: "Root", name: "HumanoidRootPart", size: [2, 2, 1], position: [x, floorY + 3, z], color: "#ffffff", anchored: false, canCollide: false, transparency: 1, castShadow: false },
    { key: "Torso", name: "Torso", size: [2, 2, 1], position: [x, floorY + 3, z], color: shirtColor, anchored: false, canCollide: true },
    { key: "Head", name: "Head", size: [2, 1, 1], position: [x, floorY + 4.5, z], color: bodyColor, anchored: false, canCollide: true },
    { key: "LeftArm", name: "Left Arm", size: [1, 2, 1], position: [x - 1.5, floorY + 3, z], color: bodyColor, anchored: false, canCollide: false },
    { key: "RightArm", name: "Right Arm", size: [1, 2, 1], position: [x + 1.5, floorY + 3, z], color: bodyColor, anchored: false, canCollide: false },
    { key: "LeftLeg", name: "Left Leg", size: [1, 2, 1], position: [x - 0.5, floorY + 1, z], color: pantsColor, anchored: false, canCollide: true },
    { key: "RightLeg", name: "Right Leg", size: [1, 2, 1], position: [x + 0.5, floorY + 1, z], color: pantsColor, anchored: false, canCollide: true },
  ];
  const partsXml = bodyParts.map((part) => {
    const material = MATERIAL_TOKENS.SmoothPlastic;
    return `<Item class="Part" referent="${refs[part.key]}"><Properties><string name="Name">${part.name}</string><bool name="Anchored">false</bool><bool name="CanCollide">${part.canCollide ? "true" : "false"}</bool><bool name="CastShadow">${part.castShadow === false ? "false" : "true"}</bool><bool name="Massless">${part.key === "Root" ? "true" : "false"}</bool><token name="Material">${material}</token><token name="shape">1</token><Color3uint8 name="Color3uint8">${parseColor(part.color)}</Color3uint8><float name="Transparency">${part.transparency || 0}</float><Vector3 name="size"><X>${part.size[0]}</X><Y>${part.size[1]}</Y><Z>${part.size[2]}</Z></Vector3>${coordinateFrame("CFrame", part.position)}</Properties>${part.key === "Root" ? motorXml("RootJoint", `RBX_${prefix}_ROOTJOINT`, refs.Root, refs.Torso, [0, 0, 0], [0, 0, 0]) : part.key === "Torso" ? [
      motorXml("Neck", `RBX_${prefix}_NECK`, refs.Torso, refs.Head, [0, 1, 0], [0, -0.5, 0]),
      motorXml("Left Shoulder", `RBX_${prefix}_LEFTSHOULDER`, refs.Torso, refs.LeftArm, [-1, 0.5, 0], [0.5, 0.5, 0]),
      motorXml("Right Shoulder", `RBX_${prefix}_RIGHTSHOULDER`, refs.Torso, refs.RightArm, [1, 0.5, 0], [-0.5, 0.5, 0]),
      motorXml("Left Hip", `RBX_${prefix}_LEFTHIP`, refs.Torso, refs.LeftLeg, [-0.5, -1, 0], [0, 1, 0]),
      motorXml("Right Hip", `RBX_${prefix}_RIGHTHIP`, refs.Torso, refs.RightLeg, [0.5, -1, 0], [0, 1, 0]),
    ].join("") : ""}</Item>`;
  }).join("");
  const health = clamp(character?.health, 1, 10000, 100);
  const speed = clamp(character?.walkSpeed, 0, 100, 12);
  const humanoid = `<Item class="Humanoid" referent="RBX_${prefix}_HUMANOID"><Properties><string name="Name">Humanoid</string><string name="DisplayName">${xml(character?.displayName || name)}</string><float name="Health">${health}</float><float name="MaxHealth">${health}</float><float name="WalkSpeed">${speed}</float><bool name="AutoRotate">true</bool><token name="RigType">0</token></Properties></Item>`;
  const behavior = scriptXml({ name: "SVANSCharacterController", className: "Script", source: npcBehaviorSource(character) }, `${prefix}_BEHAVIOR`);
  return `<Item class="Model" referent="RBX_${prefix}"><Properties><string name="Name">${xml(name)}</string><Ref name="PrimaryPart">${refs.Root}</Ref></Properties>${partsXml}${humanoid}${behavior}</Item>`;
}

function scriptXml(script, index) {
  const className = script.className === "LocalScript" ? "LocalScript" : script.className === "ModuleScript" ? "ModuleScript" : "Script";
  const source = String(script.source || "").slice(0, 60_000);
  if (BLOCKED_SOURCE.test(source)) throw new Error(`Generated script "${script.name || index}" requested a blocked external or unsafe capability.`);
  return `<Item class="${className}" referent="RBX_SCRIPT_${index}"><Properties><string name="Name">${xml(String(script.name || `Script ${index + 1}`).slice(0, 80))}</string><ProtectedString name="Source"><![CDATA[${cdata(source)}]]></ProtectedString></Properties></Item>`;
}

const ANALYTICS_MODULE = `local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local store = DataStoreService:GetDataStore("SVANSAnalytics")
local Analytics = {}

local function updateSummary(transform)
    local ok, err = pcall(function()
        store:UpdateAsync("summary", function(summary)
            summary = type(summary) == "table" and summary or {}
            summary.totalSessions = summary.totalSessions or 0
            summary.totalUniquePlayers = summary.totalUniquePlayers or 0
            summary.totalRobuxSpent = summary.totalRobuxSpent or 0
            summary.totalPurchases = summary.totalPurchases or 0
            summary.uniquePayers = summary.uniquePayers or 0
            transform(summary)
            summary.updatedAt = os.time()
            return summary
        end)
    end)
    if not ok then warn("SVANS analytics update failed:", err) end
end

function Analytics.Start()
    Players.PlayerAdded:Connect(function(player)
        local firstVisit = false
        pcall(function()
            store:UpdateAsync("player_" .. player.UserId, function(existing)
                if existing == nil then firstVisit = true return { firstSeen = os.time() } end
                return existing
            end)
        end)
        updateSummary(function(summary)
            summary.totalSessions += 1
            if firstVisit then summary.totalUniquePlayers += 1 end
        end)
    end)
end

function Analytics.RecordPurchase(receiptInfo)
    assert(type(receiptInfo) == "table", "receiptInfo is required")
    local paid = tonumber(receiptInfo.CurrencySpent) or 0
    local firstPurchase = false
    pcall(function()
        store:UpdateAsync("payer_" .. tostring(receiptInfo.PlayerId), function(existing)
            if existing == nil then firstPurchase = true return { firstPurchase = os.time() } end
            return existing
        end)
    end)
    updateSummary(function(summary)
        summary.totalRobuxSpent += paid
        summary.totalPurchases += 1
        if firstPurchase then summary.uniquePayers += 1 end
    end)
end

return Analytics`;

const ANALYTICS_BOOTSTRAP = `local Analytics = require(script.Parent:WaitForChild("SVANSAnalytics"))
Analytics.Start()`;

function createPlaceXml(spec) {
  const parts = (Array.isArray(spec.parts) ? spec.parts : []).slice(0, 120);
  const buildings = (Array.isArray(spec.buildings) ? spec.buildings : []).slice(0, 16);
  const characters = (Array.isArray(spec.characters) ? spec.characters : []).slice(0, 24);
  const scripts = (Array.isArray(spec.scripts) ? spec.scripts : []).slice(0, 24);
  const serverScripts = scripts.filter((entry) => entry.container !== "StarterPlayerScripts" && entry.container !== "StarterGui");
  const playerScripts = scripts.filter((entry) => entry.container === "StarterPlayerScripts");
  const workspaceParts = parts.length ? parts : [
    { name: "Baseplate", size: [220, 1, 220], position: [0, 0, 0], color: "#235f3a", material: "Grass" },
    { name: "Spawn", size: [12, 1, 12], position: [0, 1, 0], color: "#24d9ff", material: "Neon" },
  ];
  const allServerScripts = [
    ...serverScripts,
    { name: "SVANSAnalytics", className: "ModuleScript", source: ANALYTICS_MODULE },
    { name: "SVANSAnalyticsBootstrap", className: "Script", source: ANALYTICS_BOOTSTRAP },
  ];
  const lighting = spec.lighting && typeof spec.lighting === "object" ? spec.lighting : {};
  return `<?xml version="1.0" encoding="utf-8"?><roblox version="4"><Meta name="ExplicitAutoJoints">true</Meta>
  <Item class="Workspace" referent="RBX_WORKSPACE"><Properties><string name="Name">Workspace</string><float name="Gravity">${clamp(spec.gravity, 0, 1000, 196.2)}</float></Properties>${workspaceParts.map((part, index) => partXml(part, index, "WORLD")).join("")}${buildings.map(modelXml).join("")}${characters.map(characterXml).join("")}</Item>
  <Item class="ServerScriptService" referent="RBX_SERVER"><Properties><string name="Name">ServerScriptService</string></Properties>${allServerScripts.map(scriptXml).join("")}</Item>
  <Item class="StarterPlayer" referent="RBX_STARTER_PLAYER"><Properties><string name="Name">StarterPlayer</string></Properties><Item class="StarterPlayerScripts" referent="RBX_PLAYER_SCRIPTS"><Properties><string name="Name">StarterPlayerScripts</string></Properties>${playerScripts.map(scriptXml).join("")}</Item></Item>
  <Item class="Lighting" referent="RBX_LIGHTING"><Properties><string name="Name">Lighting</string><float name="Brightness">${clamp(lighting.brightness, 0, 10, 2)}</float><float name="ClockTime">${clamp(lighting.clockTime, 0, 24, 14)}</float><float name="FogEnd">${clamp(lighting.fogEnd, 0, 100000, 100000)}</float><bool name="GlobalShadows">${lighting.globalShadows === false ? "false" : "true"}</bool><Color3uint8 name="Ambient">${parseColor(lighting.ambient || "#66758a")}</Color3uint8><Color3uint8 name="OutdoorAmbient">${parseColor(lighting.outdoorAmbient || "#7f8fa5")}</Color3uint8></Properties></Item>
  </roblox>`;
}

function findStudioExecutable() {
  const versionsRoot = path.join(process.env.LOCALAPPDATA || "", "Roblox", "Versions");
  try {
    const matches = fs.readdirSync(versionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(versionsRoot, entry.name, "RobloxStudioBeta.exe"))
      .filter((candidate) => fs.existsSync(candidate))
      .map((candidate) => ({ candidate, mtime: fs.statSync(candidate).mtimeMs }))
      .sort((left, right) => right.mtime - left.mtime);
    return matches[0]?.candidate || null;
  } catch {
    return null;
  }
}

function runPowerShellJson(command) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) { reject(error); return; }
      try { resolve(JSON.parse(String(stdout || "{}").trim() || "{}")); } catch (parseError) { reject(parseError); }
    });
  });
}

function createRobloxAgent({ projectsRoot, storagePath, secretStore, chatFn, onStats = () => {}, onAudit = () => {} }) {
  let config = loadConfig();
  let monitorTimer = null;
  const studioCommandQueue = [];
  const studioCommandResults = new Map();
  const studioCommandStates = new Map();
  const inspectorPath = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Roblox", "Plugins", "SVANSStudioInspector.rbxmx");

  function startStudioBridge() {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url || "/", `http://127.0.0.1:${STUDIO_BRIDGE_PORT}`);
      if (url.searchParams.get("token") !== STUDIO_BRIDGE_TOKEN) {
        response.writeHead(403).end();
        return;
      }
      if (request.method === "GET" && url.pathname === "/next") {
        const placeName = normalizedAppText(url.searchParams.get("place") || "");
        const placeId = String(url.searchParams.get("placeId") || "").replace(/\D/g, "");
        const universeId = String(url.searchParams.get("universeId") || "").replace(/\D/g, "");
        const commandIndex = studioCommandQueue.findIndex((entry) =>
          (!entry.expectedPlace || normalizedAppText(entry.expectedPlace) === placeName) &&
          (!entry.expectedPlaceId || entry.expectedPlaceId === placeId) &&
          (!entry.expectedUniverseId || entry.expectedUniverseId === universeId));
        const command = commandIndex >= 0 ? studioCommandQueue.splice(commandIndex, 1)[0] : null;
        response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
        response.end(command ? JSON.stringify(command) : "{}");
        return;
      }
      if (request.method === "GET" && url.pathname === "/active") {
        const id = String(url.searchParams.get("id") || "");
        response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        response.end(studioCommandStates.get(id) === true ? "true" : "false");
        return;
      }
      if (request.method === "POST" && url.pathname === "/result") {
        let body = "";
        request.on("data", (chunk) => {
          if (body.length <= 256_000) body += chunk;
        });
        request.on("end", () => {
          try {
            const result = JSON.parse(body || "{}");
            studioCommandResults.get(String(result.id || ""))?.(result);
          } catch {
            // Invalid local results are ignored and the caller times out safely.
          }
          response.writeHead(204).end();
        });
        return;
      }
      response.writeHead(404).end();
    });
    server.on("error", (error) => onAudit({ action: "roblox_studio_bridge_error", detail: error.message, timestamp: new Date().toISOString() }));
    server.listen(STUDIO_BRIDGE_PORT, "127.0.0.1");
    server.unref();
    return server;
  }

  function sendStudioCommand(type, payload = {}, { signal, timeoutMs = 25_000, expectedPlace = "", expectedPlaceId = "", expectedUniverseId = "" } = {}) {
    signal?.throwIfAborted?.();
    const id = `svans-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      const finish = (callback, value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        studioCommandResults.delete(id);
        studioCommandStates.delete(id);
        const queuedIndex = studioCommandQueue.findIndex((command) => command.id === id);
        if (queuedIndex >= 0) studioCommandQueue.splice(queuedIndex, 1);
        callback(value);
      };
      const onAbort = () => finish(reject, signal.reason || new Error("Studio action stopped."));
      const timer = setTimeout(() => finish(reject, new Error("Roblox Studio did not answer the local control bridge. Restart Studio once and make sure HTTP Requests are enabled for this place.")), timeoutMs);
      studioCommandResults.set(id, (result) => finish(resolve, result));
      studioCommandStates.set(id, true);
      signal?.addEventListener("abort", onAbort, { once: true });
      studioCommandQueue.push({
        id,
        type,
        payload,
        expectedPlace,
        expectedPlaceId: String(expectedPlaceId || "").replace(/\D/g, ""),
        expectedUniverseId: String(expectedUniverseId || "").replace(/\D/g, ""),
      });
    });
  }

  const studioBridge = startStudioBridge();

  function ensureInspectorPlugin() {
    const content = inspectorPluginXml();
    try {
      if (fs.readFileSync(inspectorPath, "utf8") === content) return inspectorPath;
    } catch {
      // A missing or older inspector is written below.
    }
    fs.mkdirSync(path.dirname(inspectorPath), { recursive: true });
    fs.writeFileSync(inspectorPath, content, "utf8");
    onAudit({ action: "roblox_inspector_installed", detail: inspectorPath, timestamp: new Date().toISOString() });
    return inspectorPath;
  }

  function recentStudioLogs() {
    const logsRoot = path.join(process.env.LOCALAPPDATA || "", "Roblox", "logs");
    try {
      return fs.readdirSync(logsRoot, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /Studio.*_last\.log$/i.test(entry.name))
        .map((entry) => {
          const filePath = path.join(logsRoot, entry.name);
          return { filePath, modified: fs.statSync(filePath).mtimeMs };
        })
        .sort((left, right) => right.modified - left.modified)
        .slice(0, 5);
    } catch {
      return [];
    }
  }

  function latestInspectorSnapshot(sinceMs) {
    for (const log of recentStudioLogs()) {
      if (log.modified < sinceMs - 10_000) continue;
      let content;
      try {
        const size = fs.statSync(log.filePath).size;
        const start = Math.max(0, size - 2 * 1024 * 1024);
        const handle = fs.openSync(log.filePath, "r");
        const buffer = Buffer.alloc(size - start);
        try { fs.readSync(handle, buffer, 0, buffer.length, start); } finally { fs.closeSync(handle); }
        content = buffer.toString("utf8");
      } catch {
        continue;
      }
      const lines = content.split(/\r?\n/);
      const chunked = new Map();
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const markerIndex = lines[index].indexOf(INSPECTOR_MARKER);
        if (markerIndex < 0) continue;
        const payload = lines[index].slice(markerIndex + INSPECTOR_MARKER.length);
        try {
          if (!payload.startsWith("{")) {
            const first = payload.indexOf("|");
            const second = payload.indexOf("|", first + 1);
            const third = payload.indexOf("|", second + 1);
            if (first <= 0 || second <= first || third <= second) continue;
            const snapshotId = payload.slice(0, first);
            const part = Number(payload.slice(first + 1, second));
            const total = Number(payload.slice(second + 1, third));
            if (!Number.isInteger(part) || !Number.isInteger(total) || part < 1 || part > total || total > 200) continue;
            const entry = chunked.get(snapshotId) || { total, chunks: new Array(total) };
            entry.chunks[part - 1] = payload.slice(third + 1);
            chunked.set(snapshotId, entry);
            if (entry.chunks.some((chunk) => typeof chunk !== "string")) continue;
            const snapshot = JSON.parse(entry.chunks.join(""));
            if (Number(snapshot?.capturedAt || 0) * 1000 >= sinceMs - 8_000) return snapshot;
            continue;
          }
          const snapshot = JSON.parse(payload);
          if (Number(snapshot?.capturedAt || 0) * 1000 >= sinceMs - 8_000) return snapshot;
        } catch {
          // Continue to an earlier complete marker if this log line was truncated.
        }
      }
    }
    return null;
  }

  async function waitForInspectorSnapshot(sinceMs, signal) {
    const deadline = Date.now() + 32_000;
    while (Date.now() < deadline) {
      signal?.throwIfAborted?.();
      const snapshot = latestInspectorSnapshot(sinceMs);
      if (snapshot) return snapshot;
      await new Promise((resolve, reject) => {
        const onAbort = () => { clearTimeout(timer); reject(signal.reason || new Error("Inspection stopped.")); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, 1000);
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    return null;
  }

  ensureInspectorPlugin();

  function loadConfig() {
    try { return { universeId: "", placeId: "", ...JSON.parse(fs.readFileSync(storagePath, "utf8")) }; } catch { return { universeId: "", placeId: "" }; }
  }
  function saveConfig(next) {
    config = { ...config, ...next, universeId: String(next.universeId ?? config.universeId).replace(/\D/g, "").slice(0, 24), placeId: String(next.placeId ?? config.placeId).replace(/\D/g, "").slice(0, 24) };
    fs.mkdirSync(path.dirname(storagePath), { recursive: true });
    fs.writeFileSync(storagePath, JSON.stringify(config, null, 2));
    return { ...config, publishCapability: false };
  }

  async function planSpec(description, { signal, currentSpec = null, extraInstructions = "" } = {}) {
    const revisionContext = currentSpec
      ? `Revise the existing game specification below. Preserve working features unless the requested change replaces them. Return the complete revised specification, not a patch.\nExisting specification:\n${JSON.stringify(currentSpec).slice(0, 30000)}`
      : "Create a new complete game specification.";
    const prompt = [
      "Design a functional, visually structured Roblox game from the owner's description.",
      `Description: ${description}`,
      revisionContext,
      "Return ONLY JSON with: name, summary, gravity, lighting, relativePlacement, terrain, parts, buildings, objects, characters, scripts.",
      "terrain: at most 40 land features with name, kind (Block, Ball, Cylinder, Wedge), size [x,y,z], position [x,y,z], rotation [x,y,z], radius, height, and Roblox terrain material. Coordinates are relative to the ground point selected in Studio.",
      "parts: at most 90 world objects with name, size [x,y,z], position [x,y,z], rotation [x,y,z], shape (Block, Ball, Cylinder, Wedge, CornerWedge), color '#RRGGBB', material, transparency, canCollide.",
      "buildings: at most 12 named models. Each contains up to 140 architectural parts using the same part fields. Build recognizable exteriors and interiors with foundations, floors, separate wall sections, real door openings, layered roofs, windows, structural details, and gameplay spaces.",
      "For large visual builds, parts and building parts may use compact tuples instead of objects: [name,[sizeX,sizeY,sizeZ],[posX,posY,posZ],[rotX,rotY,rotZ],shape,color,material,transparency,canCollide,repeat]. repeat is optional [count,[offsetX,offsetY,offsetZ],[rotationStepX,rotationStepY,rotationStepZ]] and is expanded into real individual Parts by the desktop. Prefer 25-70 carefully chosen seed tuples with repeat groups for windows, trim, columns, stairs, battlements, roof ribs, facade bays, and other repeated geometry.",
      "objects: at most 120 placements of reusable Models from the owner's safe asset library, with name, template, role, position [x,y,z], rotation [x,y,z], scale, and assetId only when the owner explicitly supplied that asset ID. Prefer objects for doors, windows, roof modules, arches, furniture, foliage, statues, lamps, props, and decorative trim. Use ordinary parts for structural walls, floors, ceilings, rooms, and collision.",
      "characters: at most 16 R15 humanoid NPCs with name, displayName, position [x,y,z] where y is the local floor height, bodyColor, torsoColor, heightScale, widthScale, bodyTypeScale, health, walkSpeed, dialogue, role, and element. Place them on safe walkable ground.",
      "lighting: brightness, clockTime, fogEnd, ambient '#RRGGBB', outdoorAmbient '#RRGGBB', globalShadows.",
      "scripts: at most 16 Luau scripts with name, className (Script, LocalScript, or ModuleScript), container (ServerScriptService or StarterPlayerScripts), and source.",
      "When using an inspected reusable object, copy its exact templatePath and template name. Use its reported dimensions to plan spacing. Imported executable scripts are stripped; implement requested behavior with original project-specific scripts. Never invent a library match. Use parts for ordinary structural geometry and reusable detailed models where they fit the request.",
      "Build a playable core loop, player stats, clear objectives, useful buildings, environmental storytelling, NPC roles, and mobile-friendly controls when relevant.",
      extraInstructions,
      "Do not use HttpService, loadstring, numeric require calls, InsertService, ProcessReceipt, publishing, external URLs, purchases, account actions, or Robux spending.",
    ].join("\n");
    try {
      const raw = await chatFn(prompt, { signal, responseMode: "build" });
      signal?.throwIfAborted?.();
      const parsed =
  JSON.parse(
    raw
      .replace(/```json|```/g, "")
      .trim()
  );

if (!parsed || typeof parsed !== "object") {
  throw new Error(
    "SVANS planning returned an invalid Roblox specification."
  );
}

return parsed;

} catch (error) {
  if (signal?.aborted) {
    throw error;
  }

  const reason =
    error instanceof Error
      ? error.message
      : "unknown planning failure";

  throw new Error(
    `SVANS could not produce a faithful Roblox build plan for the requested subject (${reason}). No generic placeholder or unrelated fallback was created.`
  );
}
  }

  async function buildProject(description, { signal, intent = null } = {}) {
    const requested = String(description || "").trim().slice(0, 5000);
    if (!requested) throw new Error("Describe the Roblox game you want SVANS to build.");
    signal?.throwIfAborted?.();
    const newProjectGuard = intent && typeof intent === "object"
      ? [
          `Structured Phase 2 intent: ${JSON.stringify({
            action: intent.action,
            primarySubject: intent.primarySubject,
            subjects: intent.subjects,
            styles: intent.styles,
            behaviors: intent.behaviors,
            restrictions: intent.restrictions,
            preservation: intent.preservation,
          })}`,
          "Create the game described by this intent. Do not substitute an unrelated castle, village, operations center, or primitive placeholder.",
          "Only include content and systems that support the owner's actual game concept.",
        ].join("\n")
      : "Do not substitute an unrelated castle, village, operations center, or primitive placeholder.";
    const spec = await planSpec(requested, { signal, extraInstructions: newProjectGuard });
    signal?.throwIfAborted?.();
    const projectName = slug(spec.name || requested);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const projectPath = path.join(projectsRoot, `${projectName}-${stamp}`);
    fs.mkdirSync(projectPath, { recursive: true });
    signal?.throwIfAborted?.();
    const placePath = path.join(projectPath, `${projectName}.rbxlx`);
    fs.writeFileSync(placePath, createPlaceXml(spec), "utf8");
    fs.writeFileSync(path.join(projectPath, "game-spec.json"), JSON.stringify(spec, null, 2), "utf8");
    const buildingCount = Array.isArray(spec.buildings) ? spec.buildings.length : 0;
    const characterCount = Array.isArray(spec.characters) ? spec.characters.length : 0;
    fs.writeFileSync(path.join(projectPath, "README.md"), `# ${spec.name || projectName}\n\n${spec.summary || requested}\n\nBuilt locally by SVANS with ${buildingCount} structured building model(s) and ${characterCount} humanoid character(s). Publishing is intentionally owner-only.\n`, "utf8");
    const record = { name: spec.name || projectName, description: requested, projectPath, placePath, buildingCount, characterCount, createdAt: new Date().toISOString(), publishCapability: false };
    fs.writeFileSync(path.join(projectPath, "svans-project.json"), JSON.stringify(record, null, 2), "utf8");
    saveConfig({ lastSelectedRobloxProject: record.name, lastSelectedRobloxPath: placePath });
    onAudit({ action: "roblox_project_built", detail: placePath, timestamp: new Date().toISOString() });
    return record;
  }

  async function updateProject(description, { signal } = {}) {
    const requested = String(description || "").trim().slice(0, 5000);
    if (!requested) throw new Error("Describe what SVANS should change in the Roblox game.");
    const current = listProjects()[0];
    if (!current?.projectPath || !current?.placePath) throw new Error("There is no SVANS Roblox project to update yet.");
    const specPath = path.join(current.projectPath, "game-spec.json");
    const currentSpec = JSON.parse(fs.readFileSync(specPath, "utf8"));
    signal?.throwIfAborted?.();
    const spec = await planSpec(requested, { signal, currentSpec });
    signal?.throwIfAborted?.();
    const backupPath = `${current.placePath}.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    fs.copyFileSync(current.placePath, backupPath);
    fs.writeFileSync(current.placePath, createPlaceXml(spec), "utf8");
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), "utf8");
    const buildingCount = Array.isArray(spec.buildings) ? spec.buildings.length : 0;
    const characterCount = Array.isArray(spec.characters) ? spec.characters.length : 0;
    const record = { ...current, name: spec.name || current.name, description: spec.summary || current.description, buildingCount, characterCount, updatedAt: new Date().toISOString(), lastChange: requested, backupPath, publishCapability: false };
    fs.writeFileSync(path.join(current.projectPath, "README.md"), `# ${record.name}\n\n${spec.summary || current.description}\n\nUpdated locally by SVANS with ${buildingCount} structured building model(s) and ${characterCount} humanoid character(s). Publishing is intentionally owner-only.\n`, "utf8");
    fs.writeFileSync(path.join(current.projectPath, "svans-project.json"), JSON.stringify(record, null, 2), "utf8");
    saveConfig({ lastSelectedRobloxProject: record.name, lastSelectedRobloxPath: current.placePath });
    onAudit({ action: "roblox_project_updated", detail: `${current.placePath} · ${requested}`, timestamp: new Date().toISOString() });
    return record;
  }

  async function launchProject(placePath) {
    const resolved = path.resolve(String(placePath || ""));
    const root = path.resolve(projectsRoot) + path.sep;
    if (!resolved.startsWith(root) || !fs.existsSync(resolved) || path.extname(resolved).toLowerCase() !== ".rbxlx") throw new Error("Only a local SVANS Roblox place can be opened.");
    const studio = findStudioExecutable();
    if (!studio) throw new Error("Roblox Studio is not installed.");
    const child = execFile(studio, [resolved], { windowsHide: false, detached: true });
    child.unref();
    const record = listProjects().find((entry) => path.resolve(String(entry.placePath || "")) === resolved);
    saveConfig({ lastSelectedRobloxProject: record?.name || path.basename(resolved, path.extname(resolved)), lastSelectedRobloxPath: resolved });
    onAudit({ action: "roblox_studio_opened", detail: resolved, timestamp: new Date().toISOString() });
    return { ok: true, placePath: resolved, publishCapability: false };
  }

  async function launchStudio() {
    const context = await studioContext();
    if (studioLaunchDecision(context) === "reuse") {
      onAudit({ action: "roblox_studio_reused", detail: context.windowTitle || context.projectName || "Existing Studio session", timestamp: new Date().toISOString() });
      return { ok: true, alreadyOpen: true, message: `Roblox Studio is already open${context.projectName ? ` with ${context.projectName}` : ""}.`, context, publishCapability: false };
    }
    const studio = findStudioExecutable();
    if (!studio) throw new Error("Roblox Studio is not installed.");
    const child = execFile(studio, [], { windowsHide: false, detached: true });
    child.unref();
    onAudit({ action: "roblox_studio_opened", detail: studio, timestamp: new Date().toISOString() });
    return { ok: true, message: "Opening Roblox Studio.", publishCapability: false };
  }

  async function studioContext(query = "") {
    const command = `$studios = @(Get-Process RobloxStudioBeta -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object StartTime -Descending | ForEach-Object { [pscustomobject]@{ processId = $_.Id; windowTitle = $_.MainWindowTitle; startedAt = $_.StartTime.ToUniversalTime().ToString('o') } })
$recentKey = Get-ChildItem -Path 'HKCU:\\Software\\Roblox\\RobloxStudio' -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -like '*rbxRecentFiles_v03' } | Select-Object -First 1
$recent = @()
if ($recentKey) {
  $properties = Get-ItemProperty -LiteralPath $recentKey.PSPath
  $recent = @($properties.PSObject.Properties | Where-Object { $_.Name -match '^\\d+name$' -and $_.Value } | Sort-Object { [int]($_.Name -replace 'name$','') } | ForEach-Object { [pscustomobject]@{ name = [IO.Path]::GetFileNameWithoutExtension([string]$_.Value); path = [string]$_.Value } })
}
[pscustomobject]@{ sessions = @($studios); recentProjects = @($recent) } | ConvertTo-Json -Depth 5 -Compress`;
    const context = await runPowerShellJson(command);
    const recentProjects = (Array.isArray(context?.recentProjects) ? context.recentProjects : context?.recentProjects ? [context.recentProjects] : [])
      .filter((project) => project?.name && project?.path)
      .slice(0, 8);
    const rawSessions = Array.isArray(context?.sessions) ? context.sessions : context?.sessions ? [context.sessions] : [];
    const sessions = rawSessions.map((entry) => {
      const session = classifyStudioWindow(entry?.windowTitle, entry?.processId);
      const recentMatch = recentProjects.find((project) => normalizedAppText(project.name) === normalizedAppText(session.projectName));
      return { ...session, startedAt: entry?.startedAt || null, projectPath: recentMatch?.path || null };
    });
    const selectedSession = selectStudioSession(sessions, query, config.lastSelectedRobloxProject || "");
    return {
      running: sessions.length > 0,
      sessionCount: sessions.length,
      sessions,
      selectedSession,
      windowTitle: selectedSession?.windowTitle || "",
      projectName: selectedSession?.projectName || null,
      projectPath: selectedSession?.projectPath || null,
      state: selectedSession?.state || "closed",
      recentProjects,
      lastSelectedProject: config.lastSelectedRobloxProject || null,
      source: "local_studio_session_manager",
    };
  }

  async function inspectProject(query, { signal } = {}) {
    ensureInspectorPlugin();
    const context = await studioContext(query);
    const recent = context.recentProjects || [];
    if (!recent.length) throw new Error("Roblox Studio has no recent local projects to inspect.");
    const ranked = rankRecentProjects(recent, query);
    const selected = ranked[0]?.project;
    if (!selected || ranked[0].score <= 0) throw new Error(`I could not match that request to a recent Roblox project. I see: ${recent.map((project) => project.name).join(", ")}.`);
    const resolved = path.resolve(selected.path);
    if (!fs.existsSync(resolved) || !/\.rbxlx?$/i.test(resolved)) throw new Error(`${selected.name} is no longer available at its recorded path.`);
    const openSession = context.sessions.find((session) => normalizedAppText(session.projectName) === normalizedAppText(selected.name));
    if (!openSession) {
      const studio = findStudioExecutable();
      if (!studio) throw new Error("Roblox Studio is not installed.");
      const child = execFile(studio, [resolved], { windowsHide: false, detached: true });
      child.unref();
      onAudit({ action: "roblox_project_inspection_started", detail: resolved, timestamp: new Date().toISOString() });
    } else {
      onAudit({ action: "roblox_studio_session_reused", detail: `${selected.name} · process ${openSession.processId || "unknown"}`, timestamp: new Date().toISOString() });
    }
    const inspected = await sendStudioCommand("inspect", {}, { signal, timeoutMs: openSession ? 15_000 : 60_000, expectedPlace: selected.name });
    if (!inspected?.ok || !inspected.snapshot) {
      return { available: false, project: selected, opened: !openSession, reused: Boolean(openSession), inspectorPath, reason: "The matching Studio session did not return a live project snapshot. Save your work and restart that Studio window once." };
    }
    saveConfig({ lastSelectedRobloxProject: selected.name, lastSelectedRobloxPath: resolved });
    return { available: true, project: selected, opened: !openSession, reused: Boolean(openSession), session: openSession || null, snapshot: inspected.snapshot, inspectorPath };
  }

  async function applySafeFixes(query, { signal } = {}) {
    const inspection = await inspectProject(query, { signal });
    if (!inspection.available) return inspection;
    const expectedPlace = inspection.snapshot?.placeName || `${inspection.project.name}.rbxl`;
    const ping = await sendStudioCommand("ping", {}, { signal, timeoutMs: 12_000, expectedPlace });
    if (!ping?.ok) throw new Error(ping?.error || "The Roblox Studio control bridge is unavailable.");
    const result = await sendStudioCommand("safe_performance_fix", {}, { signal, timeoutMs: 45_000, expectedPlace });
    if (!result?.ok) throw new Error(result?.error || "Studio could not apply the requested fixes.");
    onAudit({ action: "roblox_safe_fixes_applied", detail: `${inspection.project.name} · anchored ${result.anchored || 0} parts`, timestamp: new Date().toISOString() });
    return { available: true, project: inspection.project, before: inspection.snapshot, result, undoAvailable: true, publishCapability: false };
  }

  function liveBuildSpec(spec, fallbackName) {
    const approvedAssetIds = new Set([...String(fallbackName || "").matchAll(/(?:asset(?:\s+id)?|rbxassetid:\/\/)\s*[:#-]?\s*(\d{5,})/gi)].map((match) => match[1]));
    const expandPart = (item) => Array.isArray(item) ? {
      name: item[0], size: item[1], position: item[2], rotation: item[3], shape: item[4], color: item[5], material: item[6], transparency: item[7], canCollide: item[8], repeat: item[9],
    } : item;
    const cleanParts = (items, maximum) => {
      const expanded = [];
      for (const source of (Array.isArray(items) ? items : [])) {
        const item = expandPart(source) || {};
        const repeat = Array.isArray(item.repeat) ? item.repeat : null;
        const count = Math.round(clamp(repeat?.[0], 1, 40, 1));
        const offset = Array.isArray(repeat?.[1]) ? repeat[1] : [0, 0, 0];
        const rotationStep = Array.isArray(repeat?.[2]) ? repeat[2] : [0, 0, 0];
        const basePosition = Array.isArray(item.position) ? item.position : [0, 0, 0];
        const baseRotation = Array.isArray(item.rotation) ? item.rotation : [0, 0, 0];
        for (let index = 0; index < count && expanded.length < maximum; index += 1) {
          expanded.push({
            ...item,
            name: count > 1 ? `${String(item.name || "SVANS Part")} ${index + 1}` : item.name,
            position: [0, 1, 2].map((axis) => Number(basePosition[axis] || 0) + Number(offset[axis] || 0) * index),
            rotation: [0, 1, 2].map((axis) => Number(baseRotation[axis] || 0) + Number(rotationStep[axis] || 0) * index),
          });
        }
        if (expanded.length >= maximum) break;
      }
      return expanded.map((item) => ({
      name: String(item?.name || "SVANS Part").slice(0, 80),
      size: Array.isArray(item?.size) ? item.size.slice(0, 3).map((value) => clamp(value, 0.1, 2048, 1)) : [8, 1, 8],
      position: Array.isArray(item?.position) ? item.position.slice(0, 3).map((value) => clamp(value, -8192, 8192, 0)) : [0, 0, 0],
      rotation: Array.isArray(item?.rotation) ? item.rotation.slice(0, 3).map((value) => clamp(value, -360, 360, 0)) : [0, 0, 0],
      shape: ["Block", "Ball", "Cylinder", "Wedge", "CornerWedge"].includes(item?.shape) ? item.shape : "Block",
      color: /^#[0-9a-f]{6}$/i.test(String(item?.color || "")) ? item.color : "#35cceb",
      material: String(item?.material || "SmoothPlastic").replace(/[^a-z]/gi, "").slice(0, 32) || "SmoothPlastic",
      transparency: clamp(item?.transparency, 0, 1, 0),
      canCollide: item?.canCollide !== false,
      anchored: true,
      }));
    };
    const scripts = (Array.isArray(spec?.scripts) ? spec.scripts : []).slice(0, 8).map((item) => ({
      name: String(item?.name || "SVANS Script").replace(/[^a-z0-9 _-]/gi, "").slice(0, 80) || "SVANS Script",
      className: ["Script", "LocalScript", "ModuleScript"].includes(item?.className) ? item.className : "Script",
      container: item?.container === "StarterPlayerScripts" ? "StarterPlayerScripts" : "ServerScriptService",
      source: BLOCKED_SOURCE.test(String(item?.source || "")) ? "-- SVANS blocked unsafe generated source." : String(item?.source || "").slice(0, 12_000),
    }));
    const terrain = (Array.isArray(spec?.terrain) ? spec.terrain : []).slice(0, 40).map((item) => ({
      name: String(item?.name || "Terrain Feature").slice(0, 80),
      kind: ["Block", "Ball", "Cylinder", "Wedge"].includes(item?.kind) ? item.kind : "Block",
      size: Array.isArray(item?.size) ? item.size.slice(0, 3).map((value) => clamp(value, 4, 4096, 24)) : [24, 8, 24],
      position: Array.isArray(item?.position) ? item.position.slice(0, 3).map((value) => clamp(value, -4096, 4096, 0)) : [0, 0, 0],
      rotation: Array.isArray(item?.rotation) ? item.rotation.slice(0, 3).map((value) => clamp(value, -360, 360, 0)) : [0, 0, 0],
      radius: clamp(item?.radius, 2, 1024, 12),
      height: clamp(item?.height, 2, 2048, 12),
      material: String(item?.material || "Ground").replace(/[^a-z]/gi, "").slice(0, 32) || "Ground",
    }));
    const characters = (Array.isArray(spec?.characters) ? spec.characters : []).slice(0, 16).map((item) => ({
      name: String(item?.name || "SVANS Character").slice(0, 70),
      displayName: String(item?.displayName || item?.name || "SVANS Character").slice(0, 70),
      role: String(item?.role || "NPC").slice(0, 80),
      element: String(item?.element || "Neutral").slice(0, 30),
      dialogue: String(item?.dialogue || "Welcome to Elemental Realms.").slice(0, 300),
      position: Array.isArray(item?.position) ? item.position.slice(0, 3).map((value) => clamp(value, -4096, 4096, 0)) : [0, 0, 0],
      bodyColor: /^#[0-9a-f]{6}$/i.test(String(item?.bodyColor || "")) ? item.bodyColor : "#c89f7c",
      torsoColor: /^#[0-9a-f]{6}$/i.test(String(item?.torsoColor || "")) ? item.torsoColor : "#456b8a",
      heightScale: clamp(item?.heightScale, 0.8, 1.2, 1),
      widthScale: clamp(item?.widthScale, 0.7, 1.3, 1),
      bodyTypeScale: clamp(item?.bodyTypeScale, 0, 1, 0.35),
      health: clamp(item?.health, 1, 10000, 100),
      walkSpeed: clamp(item?.walkSpeed, 0, 40, 10),
    }));
    const objects = (Array.isArray(spec?.objects) ? spec.objects : []).slice(0, 120).map((item) => {
      const requestedAssetId = String(item?.assetId || "").replace(/\D/g, "");
      return {
        name: String(item?.name || item?.template || "Reusable Object").slice(0, 80),
        template: String(item?.template || item?.name || "").slice(0, 100),
        templatePath: String(item?.templatePath || "").slice(0, 500),
        role: String(item?.role || "architectural detail").slice(0, 60),
        assetId: approvedAssetIds.has(requestedAssetId) ? Number(requestedAssetId) : 0,
        position: Array.isArray(item?.position) ? item.position.slice(0, 3).map((value) => clamp(value, -4096, 4096, 0)) : [0, 0, 0],
        rotation: Array.isArray(item?.rotation) ? item.rotation.slice(0, 3).map((value) => clamp(value, -360, 360, 0)) : [0, 0, 0],
        scale: clamp(item?.scale, 0.1, 20, 1),
      };
    });
    const cameraChecks = (Array.isArray(spec?.cameraChecks) ? spec.cameraChecks : Array.isArray(spec?.architecturePlan?.cameraChecks) ? spec.architecturePlan.cameraChecks : []).slice(0, 8).map((item) => ({
      name: String(item?.name || "review").slice(0, 40),
      position: Array.isArray(item?.position) ? item.position.slice(0, 3).map((value) => clamp(value, -4096, 4096, 0)) : [0, 8, 70],
      target: Array.isArray(item?.target) ? item.target.slice(0, 3).map((value) => clamp(value, -4096, 4096, 0)) : [0, 8, 0],
    }));
    return {
      name: String(spec?.name || fallbackName || "Live Build").slice(0, 80),
      relativePlacement: spec?.relativePlacement !== false,
      placementMode: spec?.placementMode === "around_latest_svans_build" ? "around_latest_svans_build" : "camera",
      updateExistingScripts: spec?.updateExistingScripts === true,
      lighting: spec?.lighting && typeof spec.lighting === "object" ? {
        brightness: clamp(spec.lighting.brightness, 0, 10, 2),
        clockTime: clamp(spec.lighting.clockTime, 0, 24, 14),
        fogEnd: clamp(spec.lighting.fogEnd, 0, 100000, 100000),
        ambient: /^#[0-9a-f]{6}$/i.test(String(spec.lighting.ambient || "")) ? spec.lighting.ambient : "#66758a",
        outdoorAmbient: /^#[0-9a-f]{6}$/i.test(String(spec.lighting.outdoorAmbient || "")) ? spec.lighting.outdoorAmbient : "#7f8fa5",
        globalShadows: spec.lighting.globalShadows !== false,
      } : null,
      parts: cleanParts(spec?.parts, 50),
      buildings: (Array.isArray(spec?.buildings) ? spec.buildings : []).slice(0, 8).map((building) => ({
        name: String(building?.name || "SVANS Building").slice(0, 80),
        parts: cleanParts(building?.parts, 220),
      })),
      terrain,
      characters,
      objects,
      scripts,
      cameraChecks,
    };
  }

  function liveSpecQuality(spec, { broad, existingScriptNames = [], requireScripts = true, allowScriptUpdates = false } = {}) {
    const buildings = Array.isArray(spec?.buildings) ? spec.buildings : [];
    const worldParts = Array.isArray(spec?.parts) ? spec.parts : [];
    const scripts = Array.isArray(spec?.scripts) ? spec.scripts : [];
    const terrain = Array.isArray(spec?.terrain) ? spec.terrain : [];
    const characters = Array.isArray(spec?.characters) ? spec.characters : [];
    const buildingPartCounts = buildings.map((building) => Array.isArray(building?.parts) ? building.parts.length : 0);
    const totalParts = worldParts.length + buildingPartCounts.reduce((total, count) => total + count, 0);
    const existing = new Set(existingScriptNames.map((name) => normalizedAppText(name)));
    const duplicateScripts = scripts.map((script) => String(script?.name || "")).filter((name) => existing.has(normalizedAppText(name)));
    const scriptCharacters = scripts.reduce((total, script) => total + String(script?.source || "").trim().length, 0);
    const placeholderScripts = scripts.filter((script) => /SVANS game scaffold online|placeholder|todo:\s*implement/i.test(String(script?.source || ""))).length;
    const trivialScripts = scripts.filter((script) => String(script?.source || "").trim().length < 100).length;
    const allParts = [...worldParts, ...buildings.flatMap((building) => Array.isArray(building?.parts) ? building.parts : [])];
    const architecturalBuild = buildings.some((building) => /\b(?:castle|citadel|fortress|palace|cathedral|sanctuary|district)\b/i.test(String(building?.name || "")));
    const nonBlockParts = allParts.filter((part) => part?.shape && part.shape !== "Block").length;
    const fineDetailParts = allParts.filter((part) => Array.isArray(part?.size) && Math.min(...part.size.map(Number)) <= 4).length;
    const architecturalDetails = allParts.filter((part) => /\b(?:tower|turret|battlement|merlon|arch|keystone|window|spire|buttress|balcony|roof|rib|column|gate|parapet|monument)\b/i.test(String(part?.name || ""))).length;
    const thinBuildings = buildingPartCounts.filter((count) => count < (broad ? 60 : architecturalBuild ? 70 : 6)).length;
    const minimumParts = broad ? 280 : architecturalBuild ? 80 : 8;
    const minimumBuildings = broad ? 4 : 1;
    const minimumScripts = requireScripts ? (broad ? 4 : 1) : 0;
    const issues = [];
    if (totalParts < minimumParts) issues.push(`only ${totalParts} physical parts (minimum ${minimumParts})`);
    if (buildings.length < minimumBuildings) issues.push(`only ${buildings.length} structured buildings/areas (minimum ${minimumBuildings})`);
    if (thinBuildings) issues.push(`${thinBuildings} building model(s) are placeholder-thin`);
    if (scripts.length < minimumScripts) issues.push(`only ${scripts.length} scripts (minimum ${minimumScripts})`);
    if (placeholderScripts) issues.push(`${placeholderScripts} placeholder scaffold script(s)`);
    if (trivialScripts) issues.push(`${trivialScripts} script(s) contain less than 100 characters of implementation`);
    if (broad && scriptCharacters < 1500) issues.push(`only ${scriptCharacters} characters of gameplay code (minimum 1500)`);
    if (broad && terrain.length < 8) issues.push(`only ${terrain.length} terrain features (minimum 8)`);
    if (broad && characters.length < 6) issues.push(`only ${characters.length} characters (minimum 6)`);
    const minimumNonBlockParts = broad ? 40 : 30;
    if ((broad || architecturalBuild) && nonBlockParts < minimumNonBlockParts) issues.push(`only ${nonBlockParts} curved or sloped architectural pieces (minimum ${minimumNonBlockParts})`);
    if ((broad || architecturalBuild) && fineDetailParts < 70) issues.push(`only ${fineDetailParts} fine-detail architectural pieces (minimum 70)`);
    if ((broad || architecturalBuild) && architecturalDetails < 70) issues.push(`only ${architecturalDetails} named architectural details (minimum 70)`);
    if (duplicateScripts.length && !allowScriptUpdates) issues.push(`script names conflict with the existing project: ${duplicateScripts.join(", ")}`);
    return { acceptable: issues.length === 0, issues, totalParts, buildings: buildings.length, terrain: terrain.length, characters: characters.length, scripts: scripts.length };
  }

  function proceduralElementalPhaseSpec(description) {
    const themes = [
      { name: "Fire", center: [-105, 0, 0], color: "#4a3330", accent: "#d89032", material: "Brick", ground: "Basalt", guard: "Ember Warden" },
      { name: "Water", center: [105, 0, 0], color: "#c5d3d6", accent: "#3d91ad", material: "Marble", ground: "Sand", guard: "Tide Sentinel" },
      { name: "Earth", center: [0, 0, -105], color: "#6c6658", accent: "#71905f", material: "Rock", ground: "Ground", guard: "Stone Keeper" },
      { name: "Wind", center: [0, 0, 105], color: "#dbe5e8", accent: "#79b9c4", material: "Marble", ground: "Grass", guard: "Sky Vanguard" },
    ];
    const buildings = themes.map((theme) => {
      const [x, , z] = theme.center;
      const part = (name, size, position, color = theme.color, material = theme.material, extra = {}) => ({ name: `${theme.name} ${name}`, size, position, rotation: [0, 0, 0], shape: "Block", color, material, canCollide: true, ...extra });
      const district = [
        part("District Foundation", [58, 2, 52], [x, 1, z], "#25313a", "Slate"),
        part("Sanctuary Floor", [38, 1, 34], [x, 2.5, z - 3], theme.accent, "Marble"),
        part("Rear Sanctuary Wall", [36, 15, 2], [x, 10, z - 18]),
        part("Left Sanctuary Wall", [2, 15, 28], [x - 17, 10, z - 4]),
        part("Right Sanctuary Wall", [2, 15, 28], [x + 17, 10, z - 4]),
        part("Gate Pillar Left", [4, 19, 4], [x - 13, 11, z + 11], theme.accent, "Metal"),
        part("Gate Pillar Right", [4, 19, 4], [x + 13, 11, z + 11], theme.accent, "Metal"),
        part("Gate Arch Left", [3, 12, 3], [x - 7, 16, z + 11], theme.accent, "Metal", { rotation: [0, 0, -28] }),
        part("Gate Arch Right", [3, 12, 3], [x + 7, 16, z + 11], theme.accent, "Metal", { rotation: [0, 0, 28] }),
        part("Gate Keystone", [7, 5, 4], [x, 21, z + 11], theme.accent, "Neon", { shape: "Wedge" }),
        part("Lower Roof", [42, 2, 36], [x, 19, z - 3], theme.color, "Metal"),
        part("Upper Roof", [30, 2, 25], [x, 22, z - 4], theme.accent, "Metal", { rotation: [0, 45, 0] }),
        part("Tower Shaft", [9, 26, 9], [x, 15, z - 12], theme.color, "Slate"),
        part("Tower Crown", [14, 4, 14], [x, 29, z - 12], theme.accent, "Metal", { rotation: [0, 45, 0] }),
        part("Tower Spire", [5, 15, 5], [x, 38, z - 12], theme.accent, "Neon", { shape: "Wedge", rotation: [0, 45, 0], canCollide: false }),
        part("Mentor Dais", [13, 2, 10], [x, 4, z - 7], theme.accent, "Metal"),
        part("Ascension Core", [8, 8, 8], [x, 11, z - 7], theme.accent, "Neon", { shape: "Ball", transparency: 0.08, canCollide: false }),
        part("Window Left", [9, 7, 0.5], [x - 10, 11, z - 16.9], theme.accent, "Glass", { transparency: 0.28, canCollide: false }),
        part("Window Right", [9, 7, 0.5], [x + 10, 11, z - 16.9], theme.accent, "Glass", { transparency: 0.28, canCollide: false }),
      ];
      for (const side of [-1, 1]) {
        const homeX = x + side * 16;
        const homeZ = z + 35;
        const direction = side < 0 ? "West" : "East";
        district.push(
          part(`${direction} House Foundation`, [16, 1, 18], [homeX, 2, homeZ], "#343d42", "Cobblestone"),
          part(`${direction} House Back Wall`, [15, 10, 1], [homeX, 7.5, homeZ + 8]),
          part(`${direction} House Left Wall`, [1, 10, 16], [homeX - 7, 7.5, homeZ]),
          part(`${direction} House Right Wall`, [1, 10, 16], [homeX + 7, 7.5, homeZ]),
          part(`${direction} House Front Left`, [5, 10, 1], [homeX - 5, 7.5, homeZ - 8]),
          part(`${direction} House Front Right`, [5, 10, 1], [homeX + 5, 7.5, homeZ - 8]),
          part(`${direction} House Door Lintel`, [5, 3, 1], [homeX, 12, homeZ - 8]),
          part(`${direction} Roof Left`, [11, 2, 19], [homeX - 3.8, 14, homeZ], theme.accent, "Slate", { shape: "Wedge", rotation: [0, 90, 0] }),
          part(`${direction} Roof Right`, [11, 2, 19], [homeX + 3.8, 14, homeZ], theme.accent, "Slate", { shape: "Wedge", rotation: [0, -90, 180] }),
          part(`${direction} Chimney`, [2.5, 8, 2.5], [homeX + side * 4, 16, homeZ + 3], "#34383c", "Brick"),
          part(`${direction} House Window`, [4, 4, 0.4], [homeX + side * 4.5, 8, homeZ - 8.6], theme.accent, "Glass", { transparency: 0.22, canCollide: false })
        );
      }
      district.push(
        part("Monument Plinth", [9, 2, 9], [x, 3, z + 23], "#26333b", "Marble"),
        part("Monument Pillar", [4, 13, 4], [x, 10, z + 23], theme.color, "Metal", { shape: "Cylinder" }),
        part("Monument Crest", [8, 8, 8], [x, 18, z + 23], theme.accent, "Neon", { shape: "Ball", transparency: 0.12, canCollide: false }),
        part("Monument Halo", [12, 1, 12], [x, 18, z + 23], "#ffffff", "Neon", { shape: "Cylinder", transparency: 0.32, canCollide: false })
      );
      for (const [cornerX, cornerZ, label] of [[-24, -20, "Northwest"], [24, -20, "Northeast"], [-24, 20, "Southwest"], [24, 20, "Southeast"]]) {
        district.push(
          part(`${label} Tower Foot`, [15, 4, 15], [x + cornerX, 4, z + cornerZ], "#283139", "Cobblestone", { shape: "Cylinder" }),
          part(`${label} Tower Shaft`, [12, 27, 12], [x + cornerX, 18.5, z + cornerZ], theme.color, "Brick", { shape: "Cylinder" }),
          part(`${label} Tower Gallery`, [17, 3, 17], [x + cornerX, 32, z + cornerZ], theme.accent, "Metal", { shape: "Cylinder" }),
          part(`${label} Tower Crown`, [14, 6, 14], [x + cornerX, 36, z + cornerZ], theme.color, "Slate", { shape: "Cylinder" }),
          part(`${label} Tower Spire`, [7, 18, 7], [x + cornerX, 48, z + cornerZ], theme.accent, "Neon", { shape: "Wedge", rotation: [0, cornerX > 0 ? 180 : 0, 0], canCollide: false }),
          part(`${label} Tower Window Lower`, [0.45, 5, 3], [x + cornerX + (cornerX > 0 ? -6.2 : 6.2), 15, z + cornerZ], theme.accent, "Glass", { transparency: 0.18, canCollide: false }),
          part(`${label} Tower Window Upper`, [3, 5, 0.45], [x + cornerX, 25, z + cornerZ + (cornerZ > 0 ? -6.2 : 6.2)], theme.accent, "Glass", { transparency: 0.18, canCollide: false })
        );
      }
      for (let index = 0; index < 8; index += 1) {
        const offset = -21 + index * 6;
        district.push(
          part(`North Battlement ${index + 1}`, [3.5, 4, 2.5], [x + offset, 23, z - 25], theme.color, "Brick"),
          part(`South Battlement ${index + 1}`, [3.5, 4, 2.5], [x + offset, 23, z + 25], theme.color, "Brick")
        );
      }
      for (let index = 0; index < 6; index += 1) {
        const offset = -17.5 + index * 7;
        district.push(
          part(`West Battlement ${index + 1}`, [2.5, 4, 3.5], [x - 29, 23, z + offset], theme.color, "Brick"),
          part(`East Battlement ${index + 1}`, [2.5, 4, 3.5], [x + 29, 23, z + offset], theme.color, "Brick")
        );
      }
      for (const side of [-1, 1]) {
        district.push(
          part(`${side < 0 ? "West" : "East"} Flying Buttress Front`, [3, 18, 5], [x + side * 21, 12, z + 9], theme.accent, "Marble", { shape: "Wedge", rotation: [0, side < 0 ? 0 : 180, side * 18] }),
          part(`${side < 0 ? "West" : "East"} Flying Buttress Rear`, [3, 18, 5], [x + side * 21, 12, z - 11], theme.accent, "Marble", { shape: "Wedge", rotation: [0, side < 0 ? 0 : 180, side * 18] })
        );
      }
      for (let index = 0; index < 4; index += 1) {
        district.push(part(`Roof Rib ${index + 1}`, [3, 5 + index * 3, 3], [x, 25 + index * 4, z - 4], theme.accent, "Metal", { rotation: [0, index * 45, 0] }));
      }
      return {
        name: `${theme.name} Ascension District`,
        parts: district,
      };
    });
    const parts = [
      { name: "Four Element Nexus", size: [44, 2, 44], position: [0, 1, 0], rotation: [0, 0, 0], shape: "Cylinder", color: "#253c52", material: "Metal", canCollide: true },
      { name: "Primal Core", size: [10, 10, 10], position: [0, 9, 0], rotation: [0, 0, 0], shape: "Ball", color: "#e8fbff", material: "Neon", transparency: 0.08, canCollide: false },
    ];
    for (const theme of themes) {
      const [x, , z] = theme.center;
      for (let index = 0; index < 5; index += 1) {
        const ratio = (index + 1) / 6;
        parts.push({ name: `${theme.name} Mastery Marker ${index + 1}`, size: [5, 1, 5], position: [x * ratio, 1.5, z * ratio], rotation: [0, 0, 0], shape: "Cylinder", color: theme.accent, material: "Neon", canCollide: true });
      }
    }
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8;
      parts.push({ name: `Nexus Ring ${index + 1}`, size: [18, 3, 6], position: [Math.round(Math.cos(angle) * 2700) / 100, 3, Math.round(Math.sin(angle) * 2700) / 100], rotation: [0, -index * 45, 0], shape: "Block", color: index % 2 ? "#47dff5" : "#bfd8e2", material: "Metal", canCollide: true });
    }
    const terrain = [
      { name: "Central Nexus Plateau", kind: "Cylinder", position: [0, -3, 0], radius: 38, height: 6, material: "Slate" },
    ];
    const characters = [];
    const objects = [];
    for (const theme of themes) {
      const [x, , z] = theme.center;
      terrain.push(
        { name: `${theme.name} District Landmass`, kind: "Cylinder", position: [x, -3, z], radius: 43, height: 6, material: theme.ground },
        { name: `${theme.name} Raised Ridge`, kind: "Ball", position: [x + (x === 0 ? 30 : 0), -7, z + (z === 0 ? 30 : 0)], radius: 13, material: theme.ground },
        { name: `${theme.name} Nexus Road`, kind: "Block", position: [x / 2, -1.5, z / 2], size: [x === 0 ? 13 : Math.abs(x) - 45, 3, z === 0 ? 13 : Math.abs(z) - 45], material: "Cobblestone" }
      );
      characters.push(
        { name: `Ascended ${theme.name} Mentor`, displayName: `Ascended ${theme.name} Mentor`, role: "Ascension mentor and quest giver", element: theme.name, dialogue: `Your ${theme.name.toLowerCase()} mastery has brought you here. Complete the sanctuary trials to ascend.`, position: [x - 6, 3, z - 6], bodyColor: "#c9916e", torsoColor: theme.color, heightScale: 1.08, widthScale: 0.95, bodyTypeScale: 0.55, health: 500, walkSpeed: 8 },
        { name: theme.guard, displayName: theme.guard, role: "District guardian", element: theme.name, dialogue: `I guard the ${theme.name} district. The training grounds are open to worthy challengers.`, position: [x + 12, 3, z + 14], bodyColor: "#9d755e", torsoColor: theme.accent, heightScale: 1.14, widthScale: 1.12, bodyTypeScale: 0.7, health: 900, walkSpeed: 9 }
      );
      objects.push(
        { name: `${theme.name} Main Gate Door`, template: "Castle Door", role: "door", position: [x, 8, z + 11], rotation: [0, 0, 0], scale: 1.35 },
        { name: `${theme.name} West Gothic Window`, template: "Gothic Window", role: "window", position: [x - 10, 11, z - 17.5], rotation: [0, 0, 0], scale: 1.2 },
        { name: `${theme.name} East Gothic Window`, template: "Gothic Window", role: "window", position: [x + 10, 11, z - 17.5], rotation: [0, 0, 0], scale: 1.2 },
        { name: `${theme.name} Courtyard Statue`, template: "Fantasy Statue", role: "statue", position: [x, 4, z + 23], rotation: [0, 180, 0], scale: 1.1 },
        { name: `${theme.name} Gate Torch Left`, template: "Wall Torch", role: "torch", position: [x - 11, 12, z + 12.8], rotation: [0, 180, 0], scale: 1 },
        { name: `${theme.name} Gate Torch Right`, template: "Wall Torch", role: "torch", position: [x + 11, 12, z + 12.8], rotation: [0, 180, 0], scale: 1 },
        { name: `${theme.name} Roof Ornament`, template: "Fantasy Roof Ornament", role: "ornament", position: [x, 48, z - 12], rotation: [0, 0, 0], scale: 1.4 },
        { name: `${theme.name} Courtyard Tree`, template: "Fantasy Tree", role: "tree", position: [x + 31, 3, z + 29], rotation: [0, 0, 0], scale: 1.2 }
      );
    }
    const progressionModule = `local Progression = {}\nProgression.Elements = { "Fire", "Water", "Earth", "Wind" }\nProgression.NormalCap = 110\nProgression.AscendedCap = 120\nfunction Progression.CanAscend(level) return tonumber(level) == Progression.NormalCap end\nfunction Progression.IsFullyAscended(level) return tonumber(level) >= Progression.AscendedCap end\nfunction Progression.CanUnlockPrimal(levels)\n    for _, element in ipairs(Progression.Elements) do if (tonumber(levels[element]) or 0) < Progression.AscendedCap then return false end end\n    return true\nend\nreturn Progression`;
    const ascensionModule = `local Ascension = {}\nAscension.Islands = {\n    Fire = { Mentor = "Ascended Fire Mentor", Levels = {111, 120} },\n    Water = { Mentor = "Ascended Water Mentor", Levels = {111, 120} },\n    Earth = { Mentor = "Ascended Earth Mentor", Levels = {111, 120} },\n    Wind = { Mentor = "Ascended Wind Mentor", Levels = {111, 120} },\n}\nfunction Ascension.Get(element) return Ascension.Islands[element] end\nreturn Ascension`;
    const playerState = `local Players = game:GetService("Players")\nlocal ELEMENTS = { "Fire", "Water", "Earth", "Wind" }\nPlayers.PlayerAdded:Connect(function(player)\n    for _, element in ipairs(ELEMENTS) do\n        if player:GetAttribute(element .. "Level") == nil then player:SetAttribute(element .. "Level", 1) end\n        if player:GetAttribute(element .. "Ascended") == nil then player:SetAttribute(element .. "Ascended", false) end\n    end\n    if player:GetAttribute("PrimalUnlocked") == nil then player:SetAttribute("PrimalUnlocked", false) end\n    if player:GetAttribute("ZenithUnlocked") == nil then player:SetAttribute("ZenithUnlocked", false) end\nend)`;
    const phaseController = `local Progression = require(script.Parent:WaitForChild("SVANS_Upgrade_ElementProgression"))\nlocal Ascension = require(script.Parent:WaitForChild("SVANS_Upgrade_AscensionRegistry"))\nlocal Controller = {}\nfunction Controller.Assess(player)\n    local levels = {}\n    for _, element in ipairs(Progression.Elements) do levels[element] = player:GetAttribute(element .. "Level") or 1 end\n    return { levels = levels, primalReady = Progression.CanUnlockPrimal(levels), ascension = Ascension.Islands }\nend\nreturn Controller`;
    const npcDialogue = `local Chat = game:GetService("Chat")\nlocal function connectPrompt(prompt)\n    if not prompt:IsA("ProximityPrompt") or prompt.Name ~= "SVANSDialoguePrompt" then return end\n    prompt.Triggered:Connect(function(player)\n        local character = prompt:FindFirstAncestorOfClass("Model")\n        if not character then return end\n        local dialogue = character:GetAttribute("SVANSDialogue") or "Welcome, traveler."\n        local head = character:FindFirstChild("Head")\n        if head then Chat:Chat(head, tostring(dialogue), Enum.ChatColor.Blue) end\n        player:SetAttribute("LastSVANSNPC", character.Name)\n    end)\nend\nfor _, descendant in ipairs(workspace:GetDescendants()) do connectPrompt(descendant) end\nworkspace.DescendantAdded:Connect(connectPrompt)`;
    return {
      name: "Elemental Realms Phase One",
      summary: description,
      relativePlacement: true,
      terrain,
      parts,
      buildings,
      objects,
      characters,
      lighting: { brightness: 2.4, clockTime: 16.2, fogEnd: 1800, ambient: "#4e6272", outdoorAmbient: "#8298a8", globalShadows: true },
      scripts: [
        { name: "SVANS_Upgrade_ElementProgression", className: "ModuleScript", container: "ServerScriptService", source: progressionModule },
        { name: "SVANS_Upgrade_AscensionRegistry", className: "ModuleScript", container: "ServerScriptService", source: ascensionModule },
        { name: "SVANS_Upgrade_PlayerState", className: "Script", container: "ServerScriptService", source: playerState },
        { name: "SVANS_Upgrade_PhaseController", className: "ModuleScript", container: "ServerScriptService", source: phaseController },
        { name: "SVANS_Upgrade_NPCDialogue", className: "Script", container: "ServerScriptService", source: npcDialogue },
      ],
    };
  }

  function proceduralFantasyCastleSpec(description) {
    const elemental = proceduralElementalPhaseSpec(description);
    const lower = String(description || "").toLowerCase();
    const selectedIndex = /water|ocean|ice|frost/.test(lower) ? 1 : /earth|forest|stone|nature/.test(lower) ? 2 : /wind|sky|cloud|air|white/.test(lower) ? 3 : 0;
    const centers = [[-105, 0, 0], [105, 0, 0], [0, 0, -105], [0, 0, 105]];
    const [centerX, , centerZ] = centers[selectedIndex];
    const selected = elemental.buildings[selectedIndex];
    const shiftPosition = (position) => Array.isArray(position) ? [Number(position[0] || 0) - centerX, Number(position[1] || 0), Number(position[2] || 0) - centerZ] : [0, 0, 0];
    const elementName = ["Fire", "Water", "Earth", "Wind"][selectedIndex];
    const castleName = /real(?:istic| life)?|medieval/.test(lower) ? "Medieval Royal Castle" : `${elementName} High Fantasy Castle`;
    const dialogueScript = elemental.scripts.find((script) => script.name === "SVANS_Upgrade_NPCDialogue");
    return {
      name: castleName,
      summary: description,
      relativePlacement: true,
      terrain: [
        { name: "Castle Plateau", kind: "Cylinder", position: [0, -3, 0], radius: 52, height: 6, material: selectedIndex === 1 ? "Sand" : selectedIndex === 3 ? "Grass" : "Rock" },
        { name: "Castle Ridge", kind: "Ball", position: [-34, -8, 28], radius: 16, material: "Rock" },
        { name: "Castle Approach", kind: "Block", position: [0, -1.5, 55], size: [16, 3, 54], material: "Cobblestone" },
      ],
      parts: [],
      buildings: [{ name: castleName, parts: selected.parts.map((part) => ({ ...part, position: shiftPosition(part.position) })) }],
      objects: elemental.objects.filter((object) => object.name.startsWith(elementName)).map((object) => ({ ...object, position: shiftPosition(object.position) })),
      characters: elemental.characters.filter((character) => character.element === elementName).map((character) => ({ ...character, position: shiftPosition(character.position) })),
      lighting: elemental.lighting,
      scripts: dialogueScript ? [{ ...dialogueScript, name: `SVANS_${elementName}_CastleDialogue` }] : [],
    };
  }

  function proceduralElementalFullGameSpec(description) {
    const foundation = proceduralElementalPhaseSpec(description);
    const originalCenters = [[-105, 0], [105, 0], [0, -105], [0, 105]];
    const ascensionCenters = [[-390, 0], [390, 0], [0, -390], [0, 390]];
    const elements = ["Fire", "Water", "Earth", "Wind"];
    const grounds = ["Basalt", "Sand", "Ground", "Grass"];
    const elevation = 65;
    const ascensionBuildings = foundation.buildings.map((building, index) => {
      const [fromX, fromZ] = originalCenters[index];
      const [toX, toZ] = ascensionCenters[index];
      return {
        name: `${elements[index]} Ascension Island Sanctuary`,
        parts: building.parts.map((item) => ({
          ...item,
          name: String(item.name).replace(`${elements[index]} `, `${elements[index]} Ascended `),
          position: [item.position[0] - fromX + toX, item.position[1] + elevation, item.position[2] - fromZ + toZ],
        })),
      };
    });
    const ascensionTerrain = ascensionCenters.flatMap(([x, z], index) => [
      { name: `${elements[index]} Ascension Island`, kind: "Cylinder", position: [x, elevation - 5, z], radius: 62, height: 10, material: grounds[index] },
      { name: `${elements[index]} Ascension Island Underside`, kind: "Ball", position: [x, elevation - 48, z], radius: 50, material: index === 1 ? "Glacier" : "Rock" },
    ]);
    const ascensionPaths = ascensionCenters.map(([x, z], index) => ({
      name: `${elements[index]} Ascension Sky Bridge`,
      size: [x === 0 ? 14 : Math.abs(x) - 155, 2, z === 0 ? 14 : Math.abs(z) - 155],
      position: [x / 2, elevation + 1, z / 2], rotation: [0, 0, 0], shape: "Block", color: ["#f5a142", "#63dff2", "#86a66a", "#d8f8ff"][index], material: "Marble", canCollide: true,
    }));
    const ascensionCharacters = foundation.characters.filter((character) => /Mentor/.test(character.name)).map((character, index) => ({
      ...character,
      name: `Grand ${elements[index]} Ascension Mentor`,
      displayName: `Grand ${elements[index]} Ascension Mentor`,
      role: "Level 111-120 ascension mentor and final trial keeper",
      dialogue: `You have reached ${elements[index]} mastery. Complete the island trials to claim full ascension.`,
      position: [ascensionCenters[index][0] - 8, elevation + 3, ascensionCenters[index][1] - 8],
    }));
    const ascensionObjects = foundation.objects.map((object) => {
      const index = elements.findIndex((element) => object.name.startsWith(element));
      if (index < 0) return object;
      const [fromX, fromZ] = originalCenters[index];
      const [toX, toZ] = ascensionCenters[index];
      return { ...object, name: `Ascended ${object.name}`, position: [object.position[0] - fromX + toX, object.position[1] + elevation, object.position[2] - fromZ + toZ] };
    });
    const combatService = `local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local remotes = ReplicatedStorage:FindFirstChild("SVANSRemotes") or Instance.new("Folder")
remotes.Name = "SVANSRemotes"
remotes.Parent = ReplicatedStorage
local useElement = remotes:FindFirstChild("UseElement") or Instance.new("RemoteEvent")
useElement.Name = "UseElement"
useElement.Parent = remotes
local DAMAGE = { Fire = 24, Water = 19, Earth = 30, Wind = 17 }
local cooldowns = {}
useElement.OnServerEvent:Connect(function(player, element, targetHumanoid)
    if type(element) ~= "string" or not DAMAGE[element] then return end
    if typeof(targetHumanoid) ~= "Instance" or not targetHumanoid:IsA("Humanoid") or targetHumanoid.Health <= 0 then return end
    local character = player.Character
    local targetModel = targetHumanoid.Parent
    local root = character and character:FindFirstChild("HumanoidRootPart")
    local targetRoot = targetModel and targetModel:FindFirstChild("HumanoidRootPart")
    if not root or not targetRoot or (root.Position - targetRoot.Position).Magnitude > 40 then return end
    local now = os.clock()
    cooldowns[player] = cooldowns[player] or {}
    if now - (cooldowns[player][element] or 0) < 0.75 then return end
    cooldowns[player][element] = now
    if player:GetAttribute("SelectedElement") == nil then player:SetAttribute("SelectedElement", element) end
    if player:GetAttribute("SelectedElement") ~= element and not player:GetAttribute("PrimalUnlocked") then return end
    targetModel:SetAttribute("SVANSLastAttacker", player.UserId)
    targetHumanoid:TakeDamage(DAMAGE[element])
end)
Players.PlayerRemoving:Connect(function(player) cooldowns[player] = nil end)`;
    const questService = `local Players = game:GetService("Players")
local connected = {}
local function award(model)
    local userId = model:GetAttribute("SVANSLastAttacker")
    local player = userId and Players:GetPlayerByUserId(userId)
    if not player then return end
    local progress = (player:GetAttribute("QuestProgress") or 0) + 1
    local goal = player:GetAttribute("QuestGoal") or 5
    player:SetAttribute("QuestProgress", progress)
    player:SetAttribute("ElementXP", (player:GetAttribute("ElementXP") or 0) + 25)
    if progress >= goal then
        player:SetAttribute("QuestComplete", true)
        player:SetAttribute("ElementXP", (player:GetAttribute("ElementXP") or 0) + 100)
    end
end
local function connect(model)
    if connected[model] or not model:GetAttribute("SVANSEnemy") then return end
    local humanoid = model:FindFirstChildOfClass("Humanoid")
    if not humanoid then return end
    connected[model] = true
    humanoid.Died:Connect(function() award(model) connected[model] = nil end)
end
for _, item in ipairs(workspace:GetDescendants()) do if item:IsA("Model") then connect(item) end end
workspace.DescendantAdded:Connect(function(item) if item:IsA("Model") then task.defer(connect, item) end end)
Players.PlayerAdded:Connect(function(player)
    player:SetAttribute("ActiveQuest", "Defeat elemental guardians")
    player:SetAttribute("QuestProgress", 0)
    player:SetAttribute("QuestGoal", 5)
    player:SetAttribute("ElementXP", player:GetAttribute("ElementXP") or 0)
end)`;
    const hudController = `local Players = game:GetService("Players")
local player = Players.LocalPlayer
local gui = Instance.new("ScreenGui")
gui.Name = "SVANSElementalHUD"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")
local panel = Instance.new("Frame")
panel.Size = UDim2.fromOffset(340, 112)
panel.Position = UDim2.new(0, 20, 1, -132)
panel.BackgroundColor3 = Color3.fromRGB(8, 22, 31)
panel.BackgroundTransparency = 0.12
panel.Parent = gui
local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -20, 0, 34)
title.Position = UDim2.fromOffset(10, 8)
title.BackgroundTransparency = 1
title.TextColor3 = Color3.fromRGB(98, 231, 255)
title.TextXAlignment = Enum.TextXAlignment.Left
title.Font = Enum.Font.GothamBold
title.TextSize = 18
title.Parent = panel
local quest = title:Clone()
quest.Position = UDim2.fromOffset(10, 44)
quest.Size = UDim2.new(1, -20, 0, 26)
quest.TextColor3 = Color3.fromRGB(230, 242, 246)
quest.TextSize = 14
quest.Parent = panel
local mastery = quest:Clone()
mastery.Position = UDim2.fromOffset(10, 74)
mastery.TextColor3 = Color3.fromRGB(255, 212, 112)
mastery.Parent = panel
local function render()
    title.Text = tostring(player:GetAttribute("SelectedElement") or "Choose an Element") .. " PATH"
    quest.Text = tostring(player:GetAttribute("ActiveQuest") or "Explore the Elemental Realms") .. "  " .. tostring(player:GetAttribute("QuestProgress") or 0) .. "/" .. tostring(player:GetAttribute("QuestGoal") or 5)
    mastery.Text = "Element XP  " .. tostring(player:GetAttribute("ElementXP") or 0) .. (player:GetAttribute("PrimalUnlocked") and "  •  PRIMAL READY" or "")
end
for _, attribute in ipairs({"SelectedElement", "ActiveQuest", "QuestProgress", "QuestGoal", "ElementXP", "PrimalUnlocked"}) do player:GetAttributeChangedSignal(attribute):Connect(render) end
render()`;
    return {
      ...foundation,
      name: "Elemental Realms Game Director Build",
      summary: description,
      updateExistingScripts: true,
      terrain: [...foundation.terrain, ...ascensionTerrain],
      parts: [...foundation.parts, ...ascensionPaths],
      buildings: [...foundation.buildings, ...ascensionBuildings],
      objects: [...foundation.objects, ...ascensionObjects],
      characters: [...foundation.characters, ...ascensionCharacters],
      scripts: [...foundation.scripts, { name: "SVANS_Game_CombatService", className: "Script", container: "ServerScriptService", source: combatService }, { name: "SVANS_Game_QuestService", className: "Script", container: "ServerScriptService", source: questService }, { name: "SVANS_Game_HUDController", className: "LocalScript", container: "StarterPlayerScripts", source: hudController }],
      cameraChecks: [
        { name: "elemental-world", position: [520, 360, 520], target: [0, 20, 0] },
        { name: "nexus", position: [0, 18, 86], target: [0, 10, 0] },
        { name: "ascension-island", position: [390, 92, 105], target: [390, 78, 0] },
      ],
      gameDirector: { version: 1, phases: ["world-foundation", "elemental-districts", "ascension-islands", "combat-progression", "quests-npcs", "player-ui"], completion: "playable-vertical-slice" },
    };
  }

  async function planLiveBuild(requested, snapshot, { signal, intent = null } = {}) {
  const coreRequest = String(intent?.original || requested || "").trim();

  // ============================================================
  // PHASE 2 — STRUCTURED BUILD INTENT
  // ============================================================

  const intentProvided =
    Boolean(intent && typeof intent === "object");

  const primarySubject =
    String(intent?.primarySubject || "unspecified");

  const subjects =
    Array.isArray(intent?.subjects)
      ? intent.subjects
      : [];

  const styles =
    Array.isArray(intent?.styles)
      ? intent.styles
      : [];

  const behaviors =
    Array.isArray(intent?.behaviors)
      ? intent.behaviors
      : [];

  const restrictions =
    Array.isArray(intent?.restrictions)
      ? intent.restrictions
      : [];

  const preservation =
    Array.isArray(intent?.preservation)
      ? intent.preservation
      : [];

  const forbiddenFallbacks =
    Array.isArray(intent?.forbiddenFallbacks)
      ? intent.forbiddenFallbacks
      : [];

  const generationRequest = [
    coreRequest,
    styles.length ? `Required visual style: ${styles.join(", ")}.` : "",
    preservation.length ? `Preserve: ${preservation.join("; ")}.` : "",
  ].filter(Boolean).join("\n");

  const castleRequested =
    intentProvided
      ? Boolean(intent.castleRequested)
      : /\b(?:castle|citadel|fortress|palace)\b/i.test(coreRequest);

  const settlementRequested =
    intentProvided
      ? Boolean(intent.settlementRequested)
      : /\b(?:town|village|kingdom|settlement|city|district|neighborhood)\b/i.test(coreRequest);

  const broad =
    Boolean(intent?.broadWorldBuild) ||
    coreRequest.length > 700 ||
    /\b(?:open-world|full game|endgame|multiple elements|city|kingdom|landscape|world)\b/i.test(coreRequest);

  // Existing builder code below still uses this variable.
  // It now means EXPLICIT castle-family architecture only.
  const architectural = castleRequested;

  const semanticGuard = [
    `Phase 2 action: ${intent?.action || "unspecified"}.`,
    `Primary requested subject: ${primarySubject}.`,

    subjects.length
      ? `Requested subject categories: ${subjects.join(", ")}.`
      : "",

    styles.length
      ? `Requested style: ${styles.join(", ")}.`
      : "",

    behaviors.length
      ? `Requested behavior: ${behaviors.join(", ")}.`
      : "",

    restrictions.length
      ? `Owner restrictions: ${restrictions.join("; ")}.`
      : "",

    preservation.length
      ? `Preserve: ${preservation.join("; ")}.`
      : "",

    castleRequested
      ? "A castle-family structure was explicitly requested."
      : "Do not create, substitute, or fall back to a castle, citadel, fortress, or palace.",

    settlementRequested
      ? "A settlement/city-type environment was explicitly requested."
      : "Do not invent a village, town, kingdom, or settlement.",

    forbiddenFallbacks.length
      ? `Forbidden substitutions: ${forbiddenFallbacks.join(", ")}.`
      : "",

    "Build the subject the owner actually requested. Never replace an unsupported subject with an unrelated template or placeholder.",
  ]
    .filter(Boolean)
    .join("\n");

  const elementalProject =
    /\belemental realms?\b/i.test(
      `${intent?.targetProject || ""} ${requested} ${snapshot?.placeName || ""}`
    );
    const knownElementalOverview = elementalProject && (/\bfire\b/i.test(coreRequest) && /\bwater\b/i.test(coreRequest) && /\bearth\b/i.test(coreRequest) && /\bwind\b/i.test(coreRequest) || /\b(?:all four elements|four elemental districts|elemental progression|ascension islands?|primal mode)\b/i.test(coreRequest));
    const existingScriptNames = (Array.isArray(snapshot?.scripts) ? snapshot.scripts : []).map((script) => String(script?.name || "").split(".").pop()).filter(Boolean);
    const assetMatches = rankAssets(coreRequest, snapshot?.reusableAssets);
    const reusableAssetNames = assetMatches.map((asset) => JSON.stringify({ name: asset.name, templatePath: asset.path, size: asset.size, partCount: asset.partCount, scriptCount: asset.scriptCount }));
    const existingSummary = snapshot ? `Existing place: ${snapshot.placeName}; ${snapshot.partCount || 0} parts; ${snapshot.scriptLines || 0} script lines. Existing script names include: ${existingScriptNames.slice(0, 45).join(", ")}. Reusable safe-library object templates: ${reusableAssetNames.length ? reusableAssetNames.join(", ") : "none detected"}.` : "The place is an existing project. Avoid generic or duplicate script names.";
    const fullGameRequested = /\b(?:entire|full|complete|whole)\s+(?:roblox\s+)?game\b|\b(?:build|create|finish)\s+(?:all|everything)\b/i.test(coreRequest);
    if (elementalProject && fullGameRequested) {
      const spec = liveBuildSpec(proceduralElementalFullGameSpec(requested), "Elemental Realms Full Game");
      const quality = liveSpecQuality(spec, { broad: true, existingScriptNames, allowScriptUpdates: true });
      if (!quality.acceptable) throw new Error(`SVANS Game Director rejected the full-game build (${quality.issues.join("; ")}). No Studio objects were changed.`);
      return { spec, quality, gameDirector: true, directorPhases: ["world foundation", "four elemental districts", "ascension islands", "combat and progression", "quests and NPCs", "player HUD"] };
    }
    const referenceDriven = Boolean(intent?.referenceRequested) || requested.includes("[SVANS MULTI-VIEW REFERENCE BLUEPRINT]");
    if (referenceDriven) {
      const readyMarker = "[SVANS READY PHOTO CONSTRUCTION SPEC]";
      const readyIndex = requested.indexOf(readyMarker);
      if (readyIndex >= 0) {
        let generated;
        try {
          generated = JSON.parse(requested.slice(readyIndex + readyMarker.length).replace(/```json|```/gi, "").trim());
        } catch {
          throw new Error("The saved photo construction plan is damaged or incomplete. Analyze the reference views again; no Studio objects were changed.");
        }
        const spec = liveBuildSpec(generated, "Multi-View Reference Build");
        spec.scripts = [];
        const quality = liveSpecQuality(spec, { broad: false, existingScriptNames, requireScripts: false });
        if (quality.totalParts < 160) quality.issues.push(`only ${quality.totalParts} expanded photo-derived parts (minimum 160)`);
        if (quality.buildings < 4) quality.issues.push(`only ${quality.buildings} photo-derived structural sections (minimum 4)`);
        quality.acceptable = quality.issues.length === 0;
        if (!quality.acceptable) throw new Error(`The ready photo construction plan failed local validation (${quality.issues.join("; ")}). Analyze the reference views again; no Studio objects were changed.`);
        return { spec, quality, referenceDriven: true, preplannedReference: true };
      }
      let lastQuality = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const generated = await planSpec(requested, {
          signal,
          extraInstructions: [
            semanticGuard,
            "This request contains a reconciled visual blueprint derived from labeled front, back, left, right, top, and possibly interior reference images.",
            "Recreate that blueprint as one coherent, explorable Roblox model. Match its silhouette, proportions, facade differences, roofline, tower count, openings, materials, colors, terrain, and interior organization. Do not replace it with a generic castle template.",
            "Produce 4-8 structured architectural sections that expand to 180-260 precisely aligned Parts. Return only 16-36 unique compact seed tuples and use repeat groups to generate repeated windows, trim, columns, stairs, roof ribs, facade bays, and details locally. Do not spell out repeated parts one by one. Use regular Parts for walls, floors, frames, columns, stairs, and roofs; use Wedge, CornerWedge, Cylinder, and Ball shapes for curves and slopes. Request reusable objects only when the snapshot names a safe match.",
            "Keep doors, stairs, corridors, railings, and rooms usable by a normal Roblox avatar. Include ground-level camera checks from the front, a side, the rear, and the interior. Make all names describe the corresponding reference feature.",
            "This is visual construction. Do not create scripts unless the owner explicitly requested behavior.",
            existingSummary,
            lastQuality ? `The previous visual plan failed because ${lastQuality.issues.join("; ")}. Correct every listed issue without simplifying the reference.` : "",
          ].filter(Boolean).join("\n"),
        });
        const spec = liveBuildSpec(generated, "Multi-View Reference Build");
        spec.scripts = spec.scripts.filter((script) => !existingScriptNames.some((name) => normalizedAppText(name) === normalizedAppText(script.name)));
        const quality = liveSpecQuality(spec, { broad: false, existingScriptNames, requireScripts: false });
        if (quality.totalParts < 180) quality.issues.push(`only ${quality.totalParts} photo-derived parts (minimum 180)`);
        if (quality.buildings < 4) quality.issues.push(`only ${quality.buildings} photo-derived structural sections (minimum 4)`);
        quality.acceptable = quality.issues.length === 0;
        if (quality.acceptable) return { spec, quality, referenceDriven: true };
        lastQuality = quality;
      }
      throw new Error(`SVANS rejected the photo-derived construction plan because it was not detailed enough (${lastQuality?.issues.join("; ") || "unknown visual-plan issue"}). No objects were created.`);
    }
    // ============================================================
// PHASE 2 — EXPLICIT CASTLE / SETTLEMENT ROUTING
// ============================================================

// A request such as:
// "add a town around the castle"
// is an expansion, NOT a request to rebuild the castle.
const additiveTown =
  settlementRequested &&
  (
    /\b(?:add|expand|place)\b[^.]{0,100}\b(?:town|village|settlement)\b/i.test(coreRequest) ||
    /\b(?:town|village|settlement)\b[^.]{0,100}\b(?:around|near|outside|surround)\b/i.test(coreRequest)
  ) &&
  (
    Boolean(intent?.followUp) ||
    /\b(?:around|near|outside|surround|existing|current)\b/i.test(coreRequest)
  );

if (additiveTown) {
  const architecture =
    generateTownExpansionBuild(generationRequest);

  if (!architecture?.validation?.passed) {
    throw new Error(
      `SVANS town-expansion validation rejected the build: ${
        architecture?.validation?.summary ||
        "unknown validation failure"
      }. No objects were created.`
    );
  }

  const spec =
    liveBuildSpec(architecture.spec, coreRequest);

  spec.scripts = spec.scripts.filter(
    (script) =>
      !existingScriptNames.some(
        (name) =>
          normalizedAppText(name) ===
          normalizedAppText(script.name)
      )
  );

  const quality =
    liveSpecQuality(spec, {
      broad: false,
      existingScriptNames,
      requireScripts: false,
    });

  if (!quality.acceptable) {
    throw new Error(
      `SVANS town-expansion safety gate rejected the build (${quality.issues.join(
        "; "
      )}). No objects were created.`
    );
  }

  return {
    spec,
    quality,
    architectureReport: architecture.validation,
    refinementPasses: architecture.refinementPasses,
    architecturalPipeline: true,
    additiveExpansion: true,
  };
}

// Only use the compound castle/kingdom generator when BOTH
// were actually requested together.
const compoundKingdom =
  castleRequested &&
  settlementRequested &&
  !additiveTown;

if (compoundKingdom) {
  const architecture =
    generateCastleTownKingdomBuild(generationRequest);

  if (!architecture?.validation?.passed) {
    throw new Error(
      `SVANS compound-kingdom validation rejected the build: ${
        architecture?.validation?.summary ||
        "unknown validation failure"
      }. No objects were created.`
    );
  }

  const spec =
    liveBuildSpec(architecture.spec, coreRequest);

  spec.scripts = spec.scripts.filter(
    (script) =>
      !existingScriptNames.some(
        (name) =>
          normalizedAppText(name) ===
          normalizedAppText(script.name)
      )
  );

  const quality =
    liveSpecQuality(spec, {
      broad: false,
      existingScriptNames,
      requireScripts: false,
    });

  if (!quality.acceptable) {
    throw new Error(
      `SVANS compound-kingdom safety gate rejected the build (${quality.issues.join(
        "; "
      )}). No objects were created.`
    );
  }

  return {
    spec,
    quality,
    architectureReport: architecture.validation,
    refinementPasses: architecture.refinementPasses,
    architecturalPipeline: true,
    compoundBuild: true,
  };
}
    if (architectural) {
      const architecture = generateArchitecturalBuild(generationRequest);
      if (!architecture?.validation?.passed) {
        throw new Error(`SVANS architecture validation rejected the build after ${architecture?.refinementPasses || 0} refinement pass(es): ${architecture?.validation?.summary || "unknown validation failure"}. No objects were created.`);
      }
      const spec = liveBuildSpec(architecture.spec, coreRequest);
      spec.scripts = spec.scripts.filter((script) => !existingScriptNames.some((name) => normalizedAppText(name) === normalizedAppText(script.name)));
      const quality = liveSpecQuality(spec, { broad: false, existingScriptNames, requireScripts: false });
      if (!quality.acceptable) {
        throw new Error(`SVANS architecture validation passed, but the Studio safety gate rejected the sanitized build (${quality.issues.join("; ")}). No objects were created.`);
      }
      return { spec, quality, architectureReport: architecture.validation, refinementPasses: architecture.refinementPasses, architecturalPipeline: true };
    }
    let lastQuality = null;
    for (let attempt = 1; attempt <= (knownElementalOverview ? 1 : 2); attempt += 1) {
      const correction = lastQuality ? `The previous plan was rejected because it had ${lastQuality.issues.join("; ")}. Correct every issue.` : "";
      const extraInstructions = broad
  ? [
      "This is a broad update to an EXISTING Roblox game. Produce one substantial, reviewable implementation phase instead of pretending to finish the entire game.",

      semanticGuard,

      "Build the owner's requested world, gameplay concept, subject, and style. Do not force an old Elemental Realms, castle, town, operations-center, or other stored template into an unrelated request.",

      knownElementalOverview
        ? "The owner explicitly referenced the multi-element Elemental Realms structure in this request, so Fire, Water, Earth, and Wind areas may be used where they actually match the request."
        : "Do not automatically create Fire, Water, Earth, Wind, elemental districts, sanctuaries, or ascension areas.",

      castleRequested
        ? "Castle-family architecture is allowed because the owner explicitly requested it."
        : "No castle, fortress, citadel, palace, battlements, castle keep, or castle-template substitution is allowed.",

      settlementRequested
        ? "Create coherent settlement areas only to the extent requested by the owner."
        : "Do not invent a town, village, kingdom, settlement, or residential district.",

      "Use terrain, roads, buildings, vehicles, characters, gameplay systems, interiors, props, UI, audio, and VFX only when they are relevant to the requested subject.",

      "Create recognizable, properly scaled geometry rather than slabs, spheres, recolored primitives, or unrelated placeholder structures.",

      "All coordinates are relative to the solid ground point under the current Studio camera focus. Keep placed content aligned to walkable ground and Roblox-player scale.",

      behaviors.length
        ? "Implement the requested behavior with clearly named cooperating Luau systems. Do not create unrelated gameplay systems."
        : "Do not invent unnecessary gameplay behavior merely to satisfy a template.",

      "Do not overwrite or duplicate existing project scripts unless the requested operation explicitly requires an update.",

      existingSummary,
      correction,
    ]
      .filter(Boolean)
      .join("\n")

  : architectural
    ? [
        semanticGuard,

        "Create the explicitly requested castle-family structure as a believable, navigable architectural model using coordinated geometry rather than stacked boxes.",

        "Use towers, arches, parapets, stairs, floors, openings, roofs, columns, structural supports, interior circulation, and details only where they support the requested design and style.",

        "Keep Roblox-player scale, navigability, collision, structural alignment, and a recognizable silhouette.",

        existingSummary,
        correction,
      ]
        .filter(Boolean)
        .join("\n")

    : [
        semanticGuard,

        "Create the recognizable finished subject the owner requested, not a placeholder primitive or unrelated building.",

        "Use enough coordinated geometry, models, constraints, scripts, or other Roblox systems to accurately represent the requested subject.",

        behaviors.length
          ? "Implement only the behaviors requested by the owner."
          : "Do not invent unnecessary behavior.",

        existingSummary,
        correction,
      ]
        .filter(Boolean)
        .join("\n");
      const generated = await planSpec(coreRequest, { signal, extraInstructions });
      const spec = liveBuildSpec(generated, coreRequest);
      const quality = liveSpecQuality(spec, {
        broad,
        existingScriptNames,
        requireScripts: behaviors.length > 0 || fullGameRequested,
      });
      if (quality.acceptable) return { spec, quality };
      lastQuality = quality;
    }
    throw new Error(`SVANS rejected its generated Studio plan because it did not faithfully meet the requested ${primarySubject} build (${lastQuality?.issues.join("; ") || "insufficient detail"}). No unrelated template or placeholder was created.`);
  }

  async function buildInsideProject(description, { signal, intent = null } = {}) {
    const requested = String(description || "").trim().slice(0, 20000);
    if (!requested) throw new Error("Describe what you want created inside the Roblox project.");
    const context = await studioContext(requested);
    let project;
    let expectedPlace;
    let ping;
    const rankedProjects = rankRecentProjects(context.recentProjects, requested);
    const explicitlyTargetedProject = rankedProjects[0]?.score > 0 ? rankedProjects[0].project : null;
    const editableSessions = context.sessions.filter((session) => session.state !== "home" && !session.playtesting);
    let selectedSession = explicitlyTargetedProject
      ? editableSessions.find((session) => normalizedAppText(session.projectName) === normalizedAppText(explicitlyTargetedProject.name))
      : selectStudioSession(editableSessions, requested, config.lastSelectedRobloxProject || "");
    if (!selectedSession) {
      const preferredRecent = context.recentProjects.find((entry) => normalizedAppText(entry.name) === normalizedAppText(config.lastSelectedRobloxProject));
      const projectToOpen = explicitlyTargetedProject || preferredRecent || context.recentProjects[0];
      if (!projectToOpen) {
        if (context.sessions.some((session) => session.playtesting)) throw new Error("Roblox Studio is playtesting, but no editable place is available. Stop the playtest or name a recent project for SVANS to open.");
        throw new Error("Roblox Studio has no open or recent local project. Ask SVANS to create a new Roblox game first.");
      }
      const resolved = path.resolve(String(projectToOpen.path || ""));
      if (!fs.existsSync(resolved) || !/\.rbxlx?$/i.test(resolved)) throw new Error(`${projectToOpen.name} is no longer available at its recorded path.`);
      const studio = findStudioExecutable();
      if (!studio) throw new Error("Roblox Studio is not installed.");
      const child = execFile(studio, [resolved], { windowsHide: false, detached: true });
      child.unref();
      project = projectToOpen;
      expectedPlace = projectToOpen.name;
      ping = await sendStudioCommand("ping", {}, { signal, timeoutMs: 60_000, expectedPlace });
      onAudit({ action: "roblox_target_project_opened", detail: `${projectToOpen.name} · ${resolved}`, timestamp: new Date().toISOString() });
    } else {
      expectedPlace = selectedSession.projectName;
      project = context.recentProjects.find((entry) => normalizedAppText(entry.name) === normalizedAppText(expectedPlace)) || { name: expectedPlace, path: selectedSession.projectPath || undefined };
      ping = await sendStudioCommand("ping", {}, { signal, timeoutMs: 15_000, expectedPlace });
      onAudit({ action: "roblox_studio_session_selected", detail: `${expectedPlace} · process ${selectedSession.processId || "unknown"}`, timestamp: new Date().toISOString() });
    }
    ping ||= await sendStudioCommand("ping", {}, { signal, timeoutMs: 12_000, expectedPlace });
    if (!ping?.ok) throw new Error(ping?.error || "The Roblox Studio control bridge is unavailable.");
    if (Number(ping.bridgeVersion || 0) < 9) throw new Error("Roblox Studio is still running the older SVANS Session Manager bridge. Save your place, restart Roblox Studio once, and then repeat the command. No new build was started.");
    signal?.throwIfAborted?.();
    const commandTarget = { expectedPlace, expectedPlaceId: ping.placeId, expectedUniverseId: ping.universeId };
    const inspection = await sendStudioCommand("inspect", {}, { signal, timeoutMs: 20_000, ...commandTarget });
    const snapshot = inspection?.snapshot || null;
    if (snapshot?.assetCatalogVersion !== 1) throw new Error("The Phase 3 asset catalog needs the updated Studio plugin. Save your place and restart Studio once to load it. No build was started.");
    const { spec, quality, architectureReport, refinementPasses, architecturalPipeline, additiveExpansion, compoundBuild, referenceDriven, gameDirector, directorPhases } = await planLiveBuild(requested, snapshot, { signal, intent });
    spec.objects = resolveObjects(spec.objects, snapshot?.reusableAssets);
    const result = await sendStudioCommand("visible_live_build", { spec }, { signal, timeoutMs: 240_000, ...commandTarget });
    if (!result?.ok) throw new Error(result?.error || "Studio could not complete the visible build.");
    const directorState = gameDirector ? {
      version: 1,
      project: project.name,
      status: "playable-vertical-slice-built",
      phases: directorPhases,
      completedAt: new Date().toISOString(),
    } : null;
    saveConfig({ ...(directorState ? { gameDirector: directorState } : {}), lastSelectedRobloxProject: project.name, lastSelectedRobloxPath: project.path || "" });
    onAudit({ action: "roblox_visible_build_completed", detail: `${project.name} · ${result.createdParts || 0} parts · ${result.createdScripts || 0} scripts`, timestamp: new Date().toISOString() });
    return { available: true, project, result, quality, architectureReport, refinementPasses, architecturalPipeline, additiveExpansion, compoundBuild, referenceDriven, gameDirector, directorPhases, directorState, undoAvailable: true, saved: false, publishCapability: false };
  }

  function listProjects() {
    try {
      return fs.readdirSync(projectsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap((entry) => {
        const folder = path.join(projectsRoot, entry.name);
        try { return [JSON.parse(fs.readFileSync(path.join(folder, "svans-project.json"), "utf8"))]; } catch { return []; }
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch { return []; }
  }

  async function publicStats() {
    if (!config.universeId) return null;
    const response = await fetch(`https://games.roblox.com/v1/games?universeIds=${encodeURIComponent(config.universeId)}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Roblox game statistics request failed (${response.status}).`);
    const game = (await response.json())?.data?.[0];
    if (!game) throw new Error("No Roblox game was found for that Universe ID.");
    return { name: game.name, playing: game.playing ?? 0, visits: game.visits ?? 0, favorites: game.favoritedCount ?? 0, maxPlayers: game.maxPlayers ?? 0, created: game.created, updated: game.updated };
  }

  async function privateAnalytics() {
    const apiKey = await secretStore.get("roblox:open_cloud_key");
    if (!apiKey || !config.universeId) return { connected: false };
    const query = new URLSearchParams({ datastoreName: "SVANSAnalytics", scope: "global", entryKey: "summary" });
    const response = await fetch(`https://apis.roblox.com/datastores/v1/universes/${encodeURIComponent(config.universeId)}/standard-datastores/datastore/entries/entry?${query}`, { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(15_000) });
    if (response.status === 404) return { connected: true, empty: true };
    if (!response.ok) throw new Error(`Private Roblox analytics request failed (${response.status}).`);
    const summary = await response.json();
    return { connected: true, totalSessions: summary.totalSessions ?? 0, totalUniquePlayers: summary.totalUniquePlayers ?? 0, totalRobuxSpent: summary.totalRobuxSpent ?? 0, totalPurchases: summary.totalPurchases ?? 0, uniquePayers: summary.uniquePayers ?? 0, updatedAt: summary.updatedAt ?? null };
  }

  async function refreshStats() {
    const result = { configured: Boolean(config.universeId), universeId: config.universeId, publishCapability: false, fetchedAt: new Date().toISOString() };
    if (!config.universeId) { onStats(result); return result; }
    const [publicResult, privateResult] = await Promise.allSettled([publicStats(), privateAnalytics()]);
    if (publicResult.status === "fulfilled") result.public = publicResult.value; else result.publicError = publicResult.reason?.message || "Public stats unavailable.";
    if (privateResult.status === "fulfilled") result.analytics = privateResult.value; else result.analyticsError = privateResult.reason?.message || "Private analytics unavailable.";
    onStats(result);
    return result;
  }

  function startMonitoring() {
    if (monitorTimer) clearInterval(monitorTimer);
    monitorTimer = setInterval(() => void refreshStats().catch(() => {}), 60_000);
    void refreshStats().catch(() => {});
  }

  return { buildProject, updateProject, buildInsideProject, launchProject, launchStudio, studioContext, inspectProject, applySafeFixes, listProjects, getConfig: () => ({ ...config, publishCapability: false }), saveConfig, refreshStats, startMonitoring, close: () => studioBridge.close() };
}

module.exports = { classifyStudioWindow, createRobloxAgent, inspectorPluginXml, rankRecentProjects, selectStudioSession, studioLaunchDecision };
