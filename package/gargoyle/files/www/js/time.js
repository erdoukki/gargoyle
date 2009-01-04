/*
 * This program is copyright � 2008 Eric Bishop and is distributed under the terms of the GNU GPL 
 * version 2.0 with a special clarification/exception that permits adapting the program to 
 * configure proprietary "back end" software provided that all modifications to the web interface
 * itself remain covered by the GPL. 
 * See http://gargoyle-router.com/faq.html#qfoss for more information
 */

function parseTimezones(timezoneLines)
{
	timezoneList = [];
	timezoneRegions = [];
	timezoneDefinitions = [];
	definitionTimezones = [];
	for(lineIndex = 0; lineIndex < timezoneLines.length; lineIndex++)
	{
		line = timezoneLines[lineIndex];
		if(!line.match(/^[\t ]*#/) && line.length > 0)
		{
			splitLine = line.split(/[\t]+/);
			region = stripQuotes( splitLine.pop() );
			definition = stripQuotes( splitLine.pop() );
			timezone = stripQuotes( splitLine.pop() );
			

			timezoneList.push(timezone);
			timezoneDefinitions[timezone] = definition;
			definitionTimezones[definition] = timezone;
			timezoneRegions[timezone] = region;
		}
	}
	return [timezoneList, timezoneRegions, timezoneDefinitions, definitionTimezones];
}
function stripQuotes(str)
{
	if(str.match(/\".*\"/))
	{
		str = str.match(/^[^\"]*\"([^\"]*)\"/)[1];
	}
	return str;
}

function parseCron(cronLines)
{
	ntpLines = [];
	otherLines = [];
	for(lineIndex = 0; lineIndex < cronLines.length; lineIndex++)
	{
		line = cronLines[lineIndex];
		if(line.match(/\/etc\/hotplug.d\/iface\/.*ntpclient/))
		{
			ntpLines.push(line);
		}
		else
		{
			otherLines.push(line);
		}
	}
	return([ntpLines, otherLines]);
}


function saveChanges()
{
	errorList = proofreadAll();
	if(errorList.length > 0)
	{
		errorString = errorList.join("\n") + "\n\nChanges could not be applied.";
		alert(errorString);
	}
	else
	{
		document.body.style.cursor="wait";
		document.getElementById("save_button").style.display="none";
		document.getElementById("reset_button").style.display="none";
		document.getElementById("update_container").style.display="block";
		
		sectionDeleteCommands = [];
		ntpSections = uciOriginal.getAllSectionsOfType("ntpclient", "ntpclient");
		for(sectionIndex=0; sectionIndex < ntpSections.length; sectionIndex++)
		{
			sectionDeleteCommands.push("uci del ntpclient." + ntpSections[sectionIndex]);
			uciOriginal.removeSection("ntpclient", ntpSections[sectionIndex]);
		}
		sectionDeleteCommands.push("uci commit");

		uci = uciOriginal.clone();	
		for(sectionIndex=0; sectionIndex < 3; sectionIndex++)
		{
			serverName = document.getElementById("server" + (sectionIndex+1)).value;
			if(serverName != "")
			{
				sectionName = "cfg" + (sectionIndex+1);
				uci.set("ntpclient", sectionName, "", "ntpclient");
				uci.set("ntpclient", sectionName, "port", "123");
				uci.set("ntpclient", sectionName, "count", "1");
				uci.set("ntpclient", sectionName, "hostname", document.getElementById("server" + (sectionIndex+1)).value);
			}
		}
	
		otherCronLines = parseCron(cronLines)[1];
		newFrequency = getSelectedValue("update_frequency");
		if(newFrequency != "never")
		{
			newCronLine = newFrequency + "	*	*	*	ACTION=ifup /etc/hotplug.d/iface/20-ntpclient"
			otherCronLines.push(newCronLine);
		}
		cronLines = otherCronLines;


		cronOutputCommands = [];
		cronOutputCommands = ["touch /etc/crontabs/root", "rm /etc/crontabs/root"];
		for(lineIndex=0; lineIndex < otherCronLines.length; lineIndex++)
		{
			cronOutputCommands.push("echo \'" + otherCronLines[lineIndex] + "\' >> /etc/crontabs/root");
		}
	
		outputDateCommand = "date \"+%D %H:%M %Z\"";
		//outputDateCommand = "\ndate\n";
			
		currentTimezoneDefinition = getSelectedValue("timezone");
		commands = commands = sectionDeleteCommands.join("\n") + "\n" + uci.getScriptCommands(uciOriginal) + "\necho \'" + currentTimezoneDefinition + "\' > /etc/TZ\nACTION=ifup /etc/hotplug.d/iface/20-ntpclient\n" + cronOutputCommands.join("\n") + "\n/etc/init.d/cron restart\n" + outputDateCommand;
		
		//document.getElementById("output").value = commands;	

		var param = getParameterDefinition("commands", commands);
		var stateChangeFunction = function(req)
		{
			if(req.readyState == 4)
			{
				var responseText=req.responseText.split(/[\r\n]+/);
				if(responseText != null)
				{
					while(responseText.length > 0 && (!responseText[ responseText.length-1].match(/:/)))
					{
						responseText.pop();
					}
					if(responseText.length > 0)
					{
						currentTime=responseText[ responseText.length-1];
					}
				}
				
				uciOriginal = uci.clone();
				resetData();
				document.getElementById("update_container").style.display="none";		
				document.getElementById("save_button").style.display="inline";
				document.getElementById("reset_button").style.display="inline";
				document.body.style.cursor='auto';
			
				//alert(req.responseText);
			}
		}
		runAjax("POST", "utility/run_commands.sh", param, stateChangeFunction);
	}
}

function proofreadAll()
{

	return "";
}

function resetData()
{
	setChildText("current_time", currentTime);
	
	timezoneList = timezoneData[0];
	timezoneDefinitions = timezoneData[2];


	removeAllOptionsFromSelectElement(document.getElementById("timezone"));
	for(tzIndex = 0; tzIndex < timezoneList.length; tzIndex++)
	{
		timezone = timezoneList[tzIndex];
		addOptionToSelectElement("timezone", timezone, timezoneDefinitions[timezone]);
	}
	setSelectedValue("timezone", currentTimezoneDefinition);

	
	ntpSections = uciOriginal.getAllSectionsOfType("ntpclient", "ntpclient");
	tzServers = [];
	for(sectionIndex=0; sectionIndex < ntpSections.length; sectionIndex++)
	{
		server = uciOriginal.get("ntpclient", ntpSections[sectionIndex], "hostname");
		if(server != "" && sectionIndex < 3)
		{
			tzServers.push(server );
			document.getElementById("server" + (1+sectionIndex)).value = server;
		}
	}			

	ntpCronLines = parseCron(cronLines)[0];
	updateFrequency="never";
	if(ntpCronLines.length > 0)
	{
		updateMatch = ntpCronLines[0].match(/^([^\t]+\t[^\t]*)\t/);
		if(updateMatch)
		{
			updateFrequency = updateMatch[1];
		}
 	}
	setSelectedValue("update_frequency", updateFrequency);
		


	
	currentRegion = "custom";
	if(tzServers.length >= 3)
	{
		testRegion = "";
		validRegion = true;
		for(serverIndex=0; serverIndex < 3 && validRegion; serverIndex++)
		{
			validRegion = false;
			nextRegion = tzServers[serverIndex].match(/[0-9]+\.([^\.]+)\.pool\.ntp\.org/);
			if(nextRegion)
			{
				if(nextRegion[1] == testRegion || testRegion == "")
				{
					testRegion = nextRegion[1];
					validRegion = true;
				}
			}
		}
		currentRegion = validRegion ? testRegion : currentRegion;
	}
	else
	{
		for(serverIndex=tzServers.length; serverIndex < 3; serverIndex++)
		{
			document.getElementById("server" + (1+sectionIndex)).value = (2-serverIndex) + ".pool.ntp.org"
		}
	}
	
	setSelectedValue("region", currentRegion);

	updateServerList();

}

function timezoneChanged()
{
	timezoneRegions = timezoneData[1];
	definitionTimezones = timezoneData[3];

	newTimezoneDefinition = getSelectedValue("timezone");
	if( getSelectedValue("region") == timezoneRegions[ definitionTimezones[previousTimezoneDefinition] ])
	{
		setSelectedValue("region", timezoneRegions[ definitionTimezones[newTimezoneDefinition] ]);
		updateServerList();
	}

	previousTimezoneDefinition = newTimezoneDefinition;
}

function updateServerList()
{
	region=getSelectedValue("region");
	for(serverIndex=1; serverIndex <= 3; serverIndex++)
	{
		if(region == "custom")
		{
			setElementEnabled( document.getElementById("server" + serverIndex), true, document.getElementById("server" + serverIndex).value);
		}
		else
		{
			setElementEnabled( document.getElementById("server" + serverIndex), false, (3-serverIndex) + "." + region + ".pool.ntp.org");	
		}
	}	
}


